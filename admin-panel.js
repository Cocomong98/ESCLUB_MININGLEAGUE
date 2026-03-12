(function () {
  function createManagerRowId(seq) {
    return `mgr_${Date.now()}_${seq}`;
  }

  window.adminPanel = function adminPanel() {
    return {
      init() {
        this.restoreSession();
      },
      password: "",
      authorized: false,
      activeTab: "members",
      managers: [],
      seasons: [],
      sortBy: "name",
      managerRowSeq: 1,
      seasonForm: {
        year: new Date().getFullYear(),
        part: "",
        startDate: "",
        startTime: "00:00",
        endDate: "",
        endTime: "23:00",
      },
      loading: {
        login: false,
        save: false,
        season: false,
        seasonList: false,
        seasonUpdate: false,
      },
      toast: { show: false, type: "info", message: "" },

      showToast(type, message) {
        this.toast = { show: true, type, message };
        setTimeout(() => {
          this.toast.show = false;
        }, 2600);
      },

      handleUnauthorized(message = "세션이 만료되었습니다. 다시 로그인하세요.") {
        this.authorized = false;
        this.password = "";
        this.managers = [];
        this.seasons = [];
        this.showToast("error", message);
      },

      normalizeHourTime(value, fallback) {
        const raw = String(value || "").trim();
        if (!raw) return fallback;
        const m = raw.match(/^(\d{1,2})(?::\d{1,2})?$/);
        if (!m) return fallback;
        const hour = Number(m[1]);
        if (Number.isNaN(hour) || hour < 0 || hour > 23) return fallback;
        return `${String(hour).padStart(2, "0")}:00`;
      },

      normalizeManagerRow(manager) {
        const row = manager && typeof manager === "object" ? { ...manager } : {};
        if (!row._rowId) {
          row._rowId = createManagerRowId(this.managerRowSeq);
          this.managerRowSeq += 1;
        }
        return row;
      },

      applyManagerSort() {
        if (!Array.isArray(this.managers) || this.managers.length <= 1) return;
        if (this.sortBy === "name") {
          this.managers.sort((a, b) =>
            String(a.name || "").localeCompare(String(b.name || ""), ["ko", "en"], {
              sensitivity: "base",
            })
          );
          return;
        }
        this.managers.sort((a, b) => new Date(b.joined_at || 0) - new Date(a.joined_at || 0));
      },

      setSortBy(next) {
        if (next !== "name" && next !== "date") return;
        if (this.sortBy === next) return;
        this.sortBy = next;
        this.applyManagerSort();
      },

      serializeManagersForSave() {
        return this.managers.map((row) => {
          const { _rowId, ...rest } = row || {};
          return rest;
        });
      },

      flushActiveInput() {
        try {
          const active = document.activeElement;
          if (active && typeof active.blur === "function") {
            active.blur();
          }
        } catch (error) {}
      },

      get computedSeasonName() {
        const year = String(this.seasonForm.year || "").trim();
        const part = String(this.seasonForm.part || "").trim();
        if (!/^[0-9]{4}$/.test(year) || !/^[0-9]+$/.test(part)) return "";
        return `${year}-${part}`;
      },

      async restoreSession() {
        try {
          const res = await fetch("/api/session", { credentials: "same-origin" });
          if (!res.ok) return;
          const data = await res.json();
          if (data.authenticated) {
            this.authorized = true;
            await this.loadManagers();
            await this.loadSeasons();
          }
        } catch (error) {}
      },

      async login() {
        this.loading.login = true;
        try {
          const res = await fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ pw: this.password }),
          });
          if (!res.ok) {
            this.password = "";
            this.showToast("error", "비밀번호가 올바르지 않습니다.");
            return;
          }
          this.authorized = true;
          await this.loadManagers();
          await this.loadSeasons();
          this.showToast("success", "관리자 인증이 완료되었습니다.");
        } catch (error) {
          this.showToast("error", "로그인 중 오류가 발생했습니다.");
        } finally {
          this.loading.login = false;
        }
      },

      async logout() {
        try {
          await fetch("/api/logout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
          });
        } catch (error) {}
        this.authorized = false;
        this.password = "";
        this.managers = [];
        this.seasons = [];
        this.showToast("info", "로그아웃되었습니다.");
      },

      async loadManagers() {
        try {
          const res = await fetch("/api/managers", { credentials: "same-origin" });
          if (res.status === 401) {
            this.handleUnauthorized();
            return;
          }
          if (!res.ok) throw new Error("failed");
          const rows = await res.json();
          this.managers = (Array.isArray(rows) ? rows : []).map((row) =>
            this.normalizeManagerRow(row)
          );
          this.applyManagerSort();
        } catch (error) {
          this.managers = [];
          this.showToast("error", "클럽원 목록을 불러오지 못했습니다.");
        }
      },

      async loadSeasons() {
        this.loading.seasonList = true;
        try {
          const res = await fetch("/api/seasons", { credentials: "same-origin" });
          if (res.status === 401) {
            this.handleUnauthorized();
            return;
          }
          if (!res.ok) throw new Error("failed");
          const data = await res.json();
          this.seasons = Array.isArray(data)
            ? data.map((season) => ({
                ...season,
                startDate: season.startDate || season.start_date || "",
                startTime: season.startTime || season.start_time || "00:00",
                endDate: season.endDate || season.end_date || "",
                endTime: season.endTime || season.end_time || "23:00",
              }))
            : [];
        } catch (error) {
          this.seasons = [];
          this.showToast("error", "시즌 목록을 불러오지 못했습니다.");
        } finally {
          this.loading.seasonList = false;
        }
      },

      addManager() {
        this.managers.push(
          this.normalizeManagerRow({
            name: "새 감독",
            joined_at: new Date().toISOString().split("T")[0],
            stat_url: "",
            squad_url: "",
          })
        );
      },

      removeManager(target) {
        if (!confirm("삭제하시겠습니까?")) return;
        this.managers = this.managers.filter((row) => row._rowId !== target._rowId);
      },

      async saveData() {
        this.loading.save = true;
        try {
          // x-model.lazy가 마지막 입력을 반영하도록 현재 포커스를 먼저 종료한다.
          this.flushActiveInput();
          await new Promise((resolve) => setTimeout(resolve, 0));

          const res = await fetch("/api/managers", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ managers: this.serializeManagersForSave() }),
          });
          if (res.status === 401) {
            this.handleUnauthorized();
            return;
          }
          if (!res.ok) {
            this.showToast("error", "저장에 실패했습니다.");
            return;
          }
          this.showToast("success", "클럽원 데이터가 저장되었습니다.");
        } catch (error) {
          this.showToast("error", "저장 중 오류가 발생했습니다.");
        } finally {
          this.loading.save = false;
        }
      },

      async createSeasonAndSplit() {
        const season = this.computedSeasonName;
        const startDate = this.seasonForm.startDate;
        const endDate = this.seasonForm.endDate;
        const startTime = this.normalizeHourTime(this.seasonForm.startTime, "00:00");
        const endTime = this.normalizeHourTime(this.seasonForm.endTime, "23:00");

        if (!season || !startDate || !endDate || !startTime || !endTime) {
          this.showToast("error", "연도, 차수, 시작/종료 일시를 모두 입력하세요.");
          return;
        }
        if (new Date(`${startDate}T${startTime}:00`) > new Date(`${endDate}T${endTime}:00`)) {
          this.showToast("error", "시작 일시는 종료 일시보다 늦을 수 없습니다.");
          return;
        }

        this.loading.season = true;
        const payload = {
          season,
          startDate,
          startTime,
          endDate,
          endTime,
          autoSplit: true,
        };

        try {
          let res = await fetch("/api/seasons/split", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify(payload),
          });

          if (!res.ok) {
            res = await fetch("/api/seasons", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              credentials: "same-origin",
              body: JSON.stringify(payload),
            });
          }

          let message = "시즌 생성이 완료되었습니다.";
          try {
            const data = await res.json();
            if (data && data.message) message = data.message;
          } catch (error) {}

          if (res.status === 401) {
            this.handleUnauthorized();
            return;
          }
          if (!res.ok) {
            this.showToast("error", message || "시즌 생성에 실패했습니다.");
            return;
          }

          this.showToast("success", message);
          this.seasonForm = {
            year: new Date().getFullYear(),
            part: "",
            startDate: "",
            startTime: "00:00",
            endDate: "",
            endTime: "23:00",
          };
          await this.loadSeasons();
        } catch (error) {
          this.showToast("error", "시즌 생성 중 오류가 발생했습니다.");
        } finally {
          this.loading.season = false;
        }
      },

      async updateSeasonRange(seasonRow) {
        const season = seasonRow.season || seasonRow.name;
        const startDate = seasonRow.startDate;
        const startTime = this.normalizeHourTime(seasonRow.startTime, "00:00");
        const endDate = seasonRow.endDate;
        const endTime = this.normalizeHourTime(seasonRow.endTime, "23:00");

        if (!season || !startDate || !endDate || !startTime || !endTime) {
          this.showToast("error", "수정할 시즌의 시작/종료 일시를 입력하세요.");
          return;
        }
        if (new Date(`${startDate}T${startTime}:00`) > new Date(`${endDate}T${endTime}:00`)) {
          this.showToast("error", "시작 일시는 종료 일시보다 늦을 수 없습니다.");
          return;
        }

        this.loading.seasonUpdate = true;
        try {
          const res = await fetch(`/api/seasons/${encodeURIComponent(season)}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            credentials: "same-origin",
            body: JSON.stringify({ startDate, startTime, endDate, endTime }),
          });

          let message = "시즌 기간이 수정되었습니다.";
          try {
            const data = await res.json();
            if (data && data.message) message = data.message;
          } catch (error) {}

          if (res.status === 401) {
            this.handleUnauthorized();
            return;
          }
          if (!res.ok) {
            this.showToast("error", message || "시즌 기간 수정에 실패했습니다.");
            return;
          }

          this.showToast("success", message);
          await this.loadSeasons();
        } catch (error) {
          this.showToast("error", "시즌 기간 수정 중 오류가 발생했습니다.");
        } finally {
          this.loading.seasonUpdate = false;
        }
      },
    };
  };
})();
