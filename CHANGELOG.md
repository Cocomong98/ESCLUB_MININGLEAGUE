# Change Log

## Project SemVer Summary (ESCLUB MINING LEAGUE)

`기존 HTML 기반 페이지 -> React 리뉴얼` 전환 이력을 기준으로 재정의한 프로젝트 버전 요약입니다.
상세 근거는 `docs/changelog/changelog_semver.md`를 참조하세요.

### `v3.4.0` (Unreleased, 후보)

- 유형: `MINOR` 권장
- 핵심:
  - Nexon Open API 기반 감독모드 분석 파이프라인 추가 (`fconline_openapi/*`)
  - 신규 CLI 추가:
    - `openapi-selftest`
    - `openapi-sync-user`
    - `openapi-update-analysis`
  - 개인 대시보드 Open API 세부 분석 섹션 추가 (lazy-load, 404 시 준비중 처리)
  - 운영 자동화:
    - APScheduler `openapi_analytics` 잡 추가 (`04:10`, daily crawl 이후)
    - 배치 중복 실행 락(`data/.openapi_analytics.lock`) 적용

### `v3.6.1` (Unreleased, 후보)

- 유형: `PATCH` 권장
- 핵심:
  - 다크모드 전역 가독성 보정:
    - 순위표 `순위` 배지, 명예의 전당 카드, 스쿼드/선수 상세 카드, 선수 모달 텍스트 대비 개선
  - UI 상태 유지:
    - `md2-ui-controller` 로컬 스토리지 기반으로 다크모드/사이드바 상태를 새로고침 후에도 유지
  - 스쿼드 페이지 운영 정리:
    - 임시 정렬 디버그 보더/프로브 코드 제거
    - 미니 사이드바 로고 중앙 정렬 보정

### `v3.3.0` (Unreleased, 후보)

- 유형: `MINOR` 권장
- 핵심:
  - 시즌 데이터 대규모 확장/분리 (`public/data/2025-4`, `public/data/2025-5`, `public/data/2026-1`)
  - 기존 루트 데이터 다수 삭제 (`public/data/user/*`, `public/data/current_crawl_display_data.json`)
  - `public/index.html` Google Analytics 스크립트 추가
- 주의:
  - 외부 소비자가 기존 루트 경로를 직접 참조하면 `MAJOR` 재판정 필요

### `v3.2.1` (2026-02-19)

- 유형: `PATCH`
- 커밋: `ec00dd4`
- 핵심: 운영 인수인계 문서 추가 (`PROJECT_STATE.md`)

### `v3.2.0` (2026-02-19)

- 유형: `MINOR`
- 커밋: `72d08a3`
- 핵심: Flask 서버 및 시즌 검증/분할/크롤링 라우팅 도입 (`app.py`)

### `v3.1.0` (2026-02-19)

- 유형: `MINOR`
- 커밋: `01062ea`
- 핵심: 운영자 페이지 및 시즌 생성/수정 UX 추가 (`admin.html`)

### `v3.0.0` (2026-02-19)

- 유형: `MAJOR`
- 커밋: `dda5967`
- 핵심:
  - 데이터 경로 계약 변경: `/data/<season>/...`
  - 시즌 쿼리 기반 라우팅(`dashboard/:id?season=...`) 도입

### `v2.0.2` (2025-10-28)

- 유형: `PATCH`
- 커밋: `9773fb2`
- 핵심: 템플릿 잔여 파일 정리 (`ISSUE_TEMPLATE.md` 삭제)

### `v2.0.1` (2025-10-28)

- 유형: `PATCH`
- 커밋: `6622f8b`
- 핵심: README를 서비스 문맥으로 개편

### `v2.0.0` (2025-10-27)

- 유형: `MAJOR`
- 커밋: `a7114d9`
- 핵심: React 기반 리뉴얼 베이스라인 도입

### `v1.x` (Legacy, Git 이전)

- 유형: 참고용
- 핵심: HTML 기반 구버전 운영 단계

## Auto Commit Log

<!-- auto-commit-log:start -->
- 2026-03-13 00:41 | patch | refactor(frontend): remove unused RTL direction state (files: 3)
- 2026-03-13 00:30 | patch | docs: reorganize docs structure and migrate legacy notes (files: 13)
- 2026-03-12 21:41 | minor | feat(scheduler): chain crawl and openapi batch at even-hour :10 (files: 5)
- 2026-03-12 21:14 | patch | fix(admin): stop shift-input cursor jump and harden admin cache invalidation (files: 3)
- 2026-03-12 20:50 | patch | docs: sync changelog and operation docs with latest ui/theming updates (files: 6)
- 2026-03-12 20:50 | patch | fix(ui): stabilize dark mode contrast, persist controller state, and clean squad debug code (files: 14)
- 2026-03-12 16:30 | patch | fix(admin): load panel script before Alpine init (files: 1)
- 2026-03-12 11:26 | patch | docs(deploy): document admin panel split and session policy (files: 5)
- 2026-03-12 11:24 | minor | feat(frontend): refine dashboard density and typography consistency (files: 10)
- 2026-03-12 11:23 | patch | fix(admin): stabilize member editor input and session expiration (files: 4)
- 2026-03-12 09:39 | patch | docs(deploy): align route docs and add server deployment cautions (files: 6)
- 2026-03-12 09:39 | patch | chore(config): sync season config and batch env defaults (files: 3)
- 2026-03-12 09:38 | patch | fix(openapi): add nickname candidate fallback chain for OUID lookup (files: 2)
- 2026-03-12 09:38 | patch | fix(openapi): improve retry backoff and failure diagnostics (files: 1)
- 2026-03-11 13:54 | patch | docs(readme): 현재 운영 구조/배포/OpenAPI 실행 가이드 갱신 (files: 1)
- 2026-03-11 13:52 | patch | docs(patch-notes): v3.5.0/v3.6.0 릴리즈 노트 반영 (files: 1)
- 2026-03-11 13:16 | patch | docs: OpenAPI 스케줄/부하제어/시즌 fallback 운영 문서 갱신 (files: 3)
- 2026-03-11 13:15 | minor | feat(openapi): season range 누락 시 데이터 기반 fallback 추가 (files: 2)
- 2026-03-11 13:15 | minor | feat(openapi): 배치 주기 분리와 닉네임 해석 우선순위 적용 (files: 3)
- 2026-03-11 13:14 | minor | feat(frontend): 스쿼드 포지션 카드 크기와 테두리 스케일 축소 (files: 3)
- 2026-03-11 13:14 | patch | chore(frontend): 감독모드 인사이트 라우트 및 진입 버튼 임시 비활성화 (files: 3)
- 2026-03-10 15:28 | patch | docs: 운영 배포 환경(NAS) 및 OpenAPI 배치 경로 정합화 (files: 2)
- 2026-03-10 15:11 | minor | feat: 기존 누적 변경사항 일괄 반영 (files: 31)
- 2026-03-10 15:08 | minor | feat: 스쿼드 지표 패널 적응형 렌더링 규칙 적용 (files: 2)
- 2026-03-02 11:20 | minor | feat: Open API 분석 파이프라인/대시보드/자동 배치 추가 (files: 9)
- 2026-03-02 09:27 | minor | feat: 프론트 성능 최적화 및 자산 포맷 개선 (files: 19)
- 2026-02-26 16:31 | minor | feat: 주간 리포트 엔진과 스키마 추가 (files: 6)
- 2026-02-22 10:38 | minor | feat(tables): 성장력 지표와 정렬 기능 추가 (files: 4)
- 2026-02-21 17:55 | patch | chore(data): ignore runtime data and keep mockup fixtures (files: 114)
<!-- auto-commit-log:end -->

---

## [2.2.0] 2023-22-05

- Fix issues
- Update dependencies
- Migrate to React 18
- Fix vulnerabilities issues
- Fix installation issues

## [2.1.0] 2022-02-14

### Bug fixing

- Momoized the context provider values
- Fix the conditionally used of useContext for MDPagination component
- Fix the import/no-anonymouse-default-export

### Major style changes

### Deleted components

### Added components

### Deleted dependencies

### Added dependencies

### Updated dependencies

```
  "@emotion/cache"                             11.4.0          ->          11.7.1
  "@emotion/react"                             11.4.1          ->          11.7.1
  "@emotion/styled"                            11.3.0          ->          11.6.0
  "@mui/icons-material"                        5.2.0           ->          5.4.1
  "@mui/material"                              5.2.0           ->          5.4.1
  "@mui/styled-engine"                         5.2.0           ->          5.4.1
  "@testing-library/jest-dom"                  5.11.4          ->          5.16.2
  "@testing-library/react"                     12.1.0          ->          12.1.2
  "@testing-library/user-event"                12.1.10         ->          13.5.0
  "chroma-js"                                  2.1.2           ->          2.4.2
  "prop-types"                                 15.7.2          ->          15.8.1
  "react-router-dom"                           6.0.2           ->          6.2.1
  "react-scripts"                              4.0.3           ->          5.0.0
  "stylis"                                     4.0.10          ->          4.0.13
  "stylis-plugin-rtl"                          2.1.0           ->          2.1.1
  "web-vitals"                                 1.0.1           ->          2.1.4
  "yup"                                        0.32.9          ->          0.32.11
```

### Warning

## [2.0.0] 2021-12-08

### Bug fixing

### Major style changes

- Migration from Material-UI to MUI v5.
- Migration from JSS to `styled` api, emotion and `sx` prop.
- Product folders and files structured are updated: [README](https://github.com/creativetimofficial/material-dashboard-react/blob/main/README.md)
- New components are added
- New example blocks are added
- Components are Example Blocks are now totally customizable and reusable
- Product now uses the react context api for global configurations

### Deleted components

- AdminNavbar.js
- ChartBar.js
- ChartLine.js
- Footer.js
- MapExample.js
- PageVisitsCard.js
- ProfileCard.js
- SettingsForm.js
- Sidebar.js
- StatusCard.js
- TableCard.js
- TrafficCard.js

### Added components

- MDAlert
- MDAvatar
- MDBadge
- MDBox
- MDButton
- MDInput
- MDPagination
- MDProgress
- MDSnackbar
- MDTypography
- Breadcrumbs
- Cards
  - BlogCards
    - SimpleBlogCard
  - InfoCards
    - DefaultInfoCard
    - ProfileInfoCard
  - MasterCard
  - ProjectCards
    - DefaultProjectCard
  - StatisticsCards
    - ComplexStatisticsCard
- Charts
  - BarCharts
    - HorizontalBarChart
    - VerticalBarChart
    - ReportsBarChart
  - BubbleChart
  - DoughnutCharts
    - DefaultDoughnutChart
  - LineCharts
    - DefaultLineChart
    - GradientLineChart
    - ProgressLineChart
    - ReportsLineChart
  - MixedChart
  - PieChart
  - PolarChart
  - RadarChart
- Configurator
- Footer
- Items
  - NotificationItem
- LayoutContainers
  - DashboardLayout
  - PageLayout
- Lists
  - ProfilesList
- Navbars
  - DashboardNavbar
  - DefaultNavbar
- Sidenav
- Tables
  - DataTable
- Timeline
  - TimelineList
  - TimelineItem

### Deleted dependencies

```
@material-ui/core
@material-ui/icons
chartist
classnames
match-sorter
moment
node-sass
react-chartist
```

### Added dependencies

```
@mui/material
@mui/icons-material
@mui/styled-engine
@emotion/cache
@emotion/react
@emotion/styled
@testing-library/jest-dom
@testing-library/react":
@testing-library/user-event
chart.js
chroma-js
prop-types
react-chartjs-2
stylis
stylis-plugin-rtl
uuid
web-vitals
```

### Updated dependencies

### Warning

## [1.10.0] 2020-05-07

### Bug fixing

- https://github.com/creativetimofficial/material-dashboard-react/issues/145 (this was solved since we've changed react-google-maps with simple Google Maps API)
- https://github.com/creativetimofficial/material-dashboard-react/issues/140 (this was solved since we've changed react-google-maps with simple Google Maps API)
- https://github.com/creativetimofficial/material-dashboard-react/issues/138 (can be closed since it was help wanted)
- https://github.com/creativetimofficial/material-dashboard-react/issues/137 (user did not respond)
- https://github.com/creativetimofficial/material-dashboard-react/issues/133 (fixed it by using `useLocation` from `react-router-dom`)
- https://github.com/creativetimofficial/material-dashboard-react/issues/16 (please check the following page: https://demos.creative-tim.com/material-dashboard-react/#/rtl/rtl-page)

### Major style changes

### Deleted components

### Added components

### Deleted dependencies

- `react-google-maps` (we've replaced this with simple Google Maps API)
- `@types/googlemaps` (we've replaced this with simple Google Maps API)
- `@types/markerclustererplus` (we've replaced this with simple Google Maps API)
- `ajv` (this was only installed to stop some install warnings)
- `history` (we'll use `BrowserRouter` from `react-router-dom` package instead)

### Added dependencies

- `@babel/core@7.14.0` (to stop install warnings)

### Updated dependencies

```
@material-ui/core         4.10.0   →   4.11.4
@material-ui/icons         4.9.1   →   4.11.2
classnames                 2.2.6   →    2.3.1
perfect-scrollbar          1.5.0   →    1.5.1
react                    16.13.1   →   17.0.2
react-chartist            0.14.3   →   0.14.4
react-dom                16.13.1   →   17.0.2
react-scripts              3.4.1   →    4.0.3
eslint-config-prettier    6.11.0   →    8.3.0
eslint-plugin-prettier     3.1.3   →    3.4.0
gulp-append-prepend        1.0.8   →    1.0.9
prettier                   2.0.5   →    2.2.1
typescript                 3.9.3   →    4.2.4
```

### Warning

_Warnings might appear while doing an npm install - they do not affect the UI or the functionality of the product, and they appear because of NodeJS and not from the product itself._

```
npm WARN react-swipeable-views@0.13.9 requires a peer of react@^15.3.0 || ^16.0.0 but none is installed. You must install peer dependencies yourself.
npm WARN react-event-listener@0.6.6 requires a peer of react@^16.3.0 but none is installed. You must install peer dependencies yourself.
```

_You will also have the following message: `found 88 vulnerabilities (1 low, 87 moderate) in 2207 scanned packages`. This comes from react-scripts, and will be fixed in the next version. NOTE: the product works as expected with these `vulnerabilities`._

## [1.9.0] 2020-05-27

### Bug fixing

- https://github.com/creativetimofficial/material-dashboard-react/issues/121
- https://github.com/creativetimofficial/material-dashboard-react/issues/98
- https://github.com/creativetimofficial/material-dashboard-react/pull/99
- https://github.com/creativetimofficial/material-dashboard-react/pull/65

### Major style changes

### Deleted components

### Added components

### Deleted dependencies

### Added dependencies

### Updated dependencies

```
@material-ui/core         4.3.2   →    4.10.0
@material-ui/icons        4.2.1   →     4.9.1
history                   4.9.0   →    4.10.1
perfect-scrollbar         1.4.0   →     1.5.0
react                    16.9.0   →   16.13.1
react-chartist           0.13.3   →    0.14.3
react-dom                16.9.0   →   16.13.1
react-router-dom          5.0.1   →     5.2.0
react-scripts             3.1.0   →     3.4.1
react-swipeable-views    0.13.3   →    0.13.9
eslint-config-prettier    6.0.0   →    6.11.0
eslint-plugin-prettier    3.1.0   →     3.1.3
prettier                 1.18.2   →     2.0.5
@types/googlemaps        3.37.3   →    3.39.6
ajv                      6.10.2   →    6.12.2
typescript                3.5.3   →     3.9.3
```

### Warning

_While in development some of the plugins that were used for this product will throw some warnings - note, this only happens in development, the UI or the functionality of the product is not affected, also, if the issues will persist in React 17, we'll drop usage of those plugins, and replace them with other ones._
_Warnings might appear while doing an npm install - they do not affect the UI or the functionality of the product, and they appear because of NodeJS and not from the product itself._

## [1.8.0] 2019-08-26

### Bug fixing

- Rewrote the ISSUE_TEMPLATE
- Deleted the copyright comments from all files, we only need to keep them inside our index.js and index.html
- Added script that adds copyrights to the built app
- Renamed all the files from `.jsx` to `.js`
- Changed the `withStyles` function from Material-UI with the `makeStyles` function (integration with other frameworks should now be easy)
- React Hooks is now supported

### Major style changes

- Renamed `assets/jss/material-dashboard-react/layouts/dashboardStyle.js` to `assets/jss/material-dashboard-react/layouts/adminStyle.js`

### Deleted components

### Added components

### Deleted dependencies

### Added dependencies

- gulp@4.0.2
- gulp-append-prepend@1.0.8

### Updated dependencies

```
@material-ui/core         4.1.0   →    4.3.2
@material-ui/icons        4.1.0   →    4.2.1
react                    16.8.6   →   16.9.0
react-dom                16.8.6   →   16.9.0
react-scripts             3.0.1   →    3.1.0
eslint-config-prettier    4.3.0   →    6.0.0
@types/googlemaps        3.36.4   →   3.37.3
ajv                      6.10.0   →   6.10.2
typescript                3.5.1   →    3.5.3
```

## [1.7.0] 2019-06-19

### Warning

**All React Material products have now the same version, i.e. 1.7.0.**

- **All linting errors are solved now, but due to google analytics stuff, we've needed to add target="\_blank" to our links, so this lint error still exists.**

### Bug fixing

- Bugs from updated dependencies
- Removed `.env` file, and replaced it with the `jsconfig.json` file
- Changes caused by running [the prettier command](https://prettier.io/docs/en/install.html) for _.jsx_, _.js_, _.html_ and _.css_ files
- Changed all string refs to `React.createRef()`
- Added types validation in each component
- Solved linting issues
- Solved https://github.com/creativetimofficial/material-dashboard-react/issues/83

### Major style changes

### Deleted components

### Added components

### Deleted dependencies

### Added dependencies

- typescript@3.5.1 (To stop console warnings on install)

### Updated dependencies

```
@material-ui/core          3.9.2   →    4.1.0
@material-ui/icons         3.0.2   →    4.1.0
chartist                  0.10.1   →   0.11.2
history                    4.7.2   →    4.9.0
prettier                  1.16.4   →   1.18.2
prop-types                15.7.1   →   15.7.2
react                     16.8.1   →   16.8.6
react-dom                 16.8.1   →   16.8.6
react-router-dom           4.3.1   →    5.0.1
react-scripts              2.1.5   →    3.0.1
react-swipeable-views     0.13.1   →   0.13.3
eslint-config-prettier     4.0.0   →    4.3.0
eslint-plugin-prettier     3.0.1   →    3.1.0
@types/googlemaps        3.30.16   →   3.36.4
ajv                        6.9.1   →   6.10.0
```

## [1.6.0] 2019-02-13

### Nice stuff

- [Added RTL support](https://github.com/creativetimofficial/material-dashboard-react/issues/16)

### Bug Fixing

- [Added new script for npm](https://github.com/creativetimofficial/material-dashboard-react/issues/69)
- Changed our buggy routing system, now it should work flawlessly, for more info, please refer to our [live docs here](https://demos.creative-tim.com/material-dashboard-react/#/documentation/routing-system)
- [https://github.com/creativetimofficial/material-dashboard-react/issues/67](https://github.com/creativetimofficial/material-dashboard-react/issues/67)
- [https://github.com/creativetimofficial/material-dashboard-react/issues/68](https://github.com/creativetimofficial/material-dashboard-react/issues/68)
- [https://github.com/creativetimofficial/material-dashboard-react/issues/66](https://github.com/creativetimofficial/material-dashboard-react/issues/66)

### Major style changes

- Almost all styles have been changed due to new components, solved issues or [the prettier command](https://prettier.io/docs/en/install.html)

### Major components changes

- Changes caused by running [the prettier command](https://prettier.io/docs/en/install.html) for _.jsx_, _.js_, _.html_ and _.css_ files
- **src/index.js**
- **src/components/CustomTabs/CustomTabs.jsx**
- **src/components/Header/Header.jsx**
- **src/components/Sidebar/Sidebar.jsx**
- **src/components/Snackbar/Snackbar.jsx**
- **src/components/Snackbar/SnackbarContent.jsx**
- **src/components/Tasks/Tasks.jsx**
- **src/views/Notifications/Notifications.jsx**

### New components

- **src/components/FixedPlugin/FixedPlugin.jsx**(Left menu used by us for customization - due to this, we've had to add a link for the fonts awesome cdn)
- **src/components/Header/RTLHeaderLinks.jsx**
- **src/layouts/Admin.jsx** (instead of Dashboard)
- **src/layouts/RTL.jsx**
- **src/views/RTLPage/RTLPage.jsx**

### Deleted components

- **src/layouts/Dashboard/Dashboard.jsx** (renamed to Admin)
- **src/routes/dashboard.jsx**
- **src/routes/index.jsx**

### Deleted dependencies

- `babel-plugin-module-resolver` (because of the upgrade of `react-scripts`)
- `babel-eslint` (because of the upgrade of `react-scripts`)
- `eslint` (because of the upgrade of `react-scripts`)
- `eslint-plugin-react` (because of the upgrade of `react-scripts`)
- `npm-run-all`

### Added dependencies

- `history4.7.2`
- `prop-types@15.6.2`
- `prettier@1.16.4`

### Updated dependencies

- `@material-ui/core` _3.1.0_ → **3.9.2**
- `@material-ui/icons` _3.0.1_ → **3.0.2**
- `@types/googlemaps` _3.30.13_ → **3.30.16**
- `ajv` _^5.0.0_ → **6.9.1**
- `prop-types` _15.6.2_ → **15.7.1**
- `react` _16.5.2_ → **16.8.1**
- `react-chartist` _0.13.1_ → **0.13.3**
- `react-dom` _16.5.2_ → **16.8.1**
- `react-scripts` _1.1.5_ → **2.1.5**
- `react-swipeable-views` _0.12.17_ → **0.13.1**
- `eslint-config-prettier` _3.0.1_ → **4.0.0**
- `eslint-plugin-prettier` _2.6.2_ → **3.0.1**

## [1.5.0] 2018-09-21

### Nice stuff

- Added `install:clean` command (deletes `node_modules` and `package-lock.json` and runs `npm install`)

### Major style changes

- `src/assets/jss/material-dashboard-react/components/tasksStyle.jsx`
- `src/assets/jss/material-dashboard-react/checkboxAdnRadioStyle.jsx`
- `src/assets/jss/material-dashboard-react/components/customTabsStyle.jsx`
- `src/assets/jss/material-dashboard-react/components/snackbarContentStyle.jsx`

### Deleted dependencies

- `@babel/runtime v7.0.0-beta.55`

### Added dependencies

### Updated dependencies

- `@material-ui/core` _1.4.3_ → **3.1.0**
- `@material-ui/icons` _2.0.1_ → **3.0.1**
- `@types/googlemaps` _3.30.11_ → **3.30.13**
- `ajv` _6.5.2_ → **5.0.0** (to stop some warnings)
- `react` _16.4.1_ → **16.5.2**
- `react-dom` _16.4.1_ → **16.5.2**
- `react-scripts` _1.1.4_ → **1.1.5**
- `react-swipeable-views` _0.12.15_ → **0.12.17**
- `eslint-config-prettier` _^2.9.0_ → **3.0.1**
- `eslint-plugin-react` _^7.10.0_ → **7.11.1**
- `prettier` _^1.13.7_ → **1.14.3**

## [1.4.1] 2018-08-10

### Bug Fixing

- Github solved issues:
  - `https://github.com/creativetimofficial/material-dashboard-react/issues/58`
- Changed the `GridContainer` component

### Major style changes

- `src/assets/jss/material-dashboard-react/components/footerStyle.jsx`
- `src/assets/jss/material-dashboard-react/components/headerStyle.jsx`

### Added dependencies

- `@babel/runtime v7.0.0-beta.55`

### Update dependencies

- `@material-ui/core v1.4.1` to `@material-ui/core v1.4.3`
- `@material-ui/icons v2.0.0` to `@material-ui/icons v2.0.1`

## [1.4.0] 2018-07-26

### Bug Fixing

- Added resize event listener for window ([see this issue here](https://github.com/creativetimofficial/ct-material-dashboard-pro-react/issues/40#issuecomment-406983150))
- Added issues template file
- Github solved issues:
  - https://github.com/creativetimofficial/material-dashboard-react/issues/49 (dropped `react-popper` in favour of `@material-ui/core/Popper`)
  - https://github.com/creativetimofficial/material-dashboard-react/issues/47
  - https://github.com/creativetimofficial/material-dashboard-react/issues/45
  - https://github.com/creativetimofficial/material-dashboard-react/issues/38
  - https://github.com/creativetimofficial/material-dashboard-react/issues/37
- Github enhancement issues:
  - https://github.com/creativetimofficial/material-dashboard-react/issues/47 (read the [./README.md](./README.md) file)

### Major style changes

- Added styles for `svg`'s, **font-awesome** classes and `.material-icons` class inside
  - `src/assets/jss/material-dashboard-react/views/dashboardStyle.jsx`
  - `src/assets/jss/material-dashboard-react/components/buttonStyle.jsx`
  - `src/assets/jss/material-dashboard-react/components/cardFooterStyle.jsx`
  - `src/assets/jss/material-dashboard-react/components/cardHeaderStyle.jsx`
  - `src/assets/jss/material-dashboard-react/components/headerLinksStyle.jsx`
  - `src/assets/jss/material-dashboard-react/components/customTabsStyle.jsx`
- Others
  - `src/assets/jss/material-dashboard-react/tooltipStyle.jsx`
  - `src/assets/jss/material-dashboard-react/dropdownStyle.jsx`

### Dropped components

- Dropped popper usage in favour of `@material-ui/core/Popper` (Changes in `src/components/Header/HeaderLinks.jsx`)

### Added components

- `src/components/Grid/GridContainer.jsx` (instead of MUI's `<Grid container...` component)

### Deleted dependencies

### Added dependencies

### Update dependencies

- `@material-ui/core v1.2.1` to `@material-ui/core v1.4.1`
- `@material-ui/icons v1.1.0` to `@material-ui/icons v2.0.0`
- `@types/googlemaps v3.30.9` to `@types/googlemaps v3.30.11`
- `ajv v6.5.1` to `ajv v6.5.2`
- `react v16.4.0` to `react v16.4.1`
- `react-dom v16.4.0` to `react-dom v16.4.1`
- `react-swipeable-views v0.12.13` to `react-swipeable-views v0.12.15`

## [1.3.0] 2018-06-15

### Bug Fixing

- Changed import from `material-ui` to `@material-ui/core`
- Droped `src/components/index.js`, and changed all the imports to separate ones
- Renamed `ItemGrid` to `GridItem`

### Major style changes

- Moved the styles of `src/components/` inside `src/assets/jss/material-dashboard-react/components/`
- Moved the styles of `src/layouts/` inside `src/assets/jss/material-dashboard-react/layouts/`
- Moved the styles of `src/views/` inside `src/assets/jss/material-dashboard-react/views/`
- Almost all styles have been changed more or less

### Dropped components

- `src/components/CustomButtons/IconButton.jsx` (instead use `src/components/CustomButtons/Button.jsx` with `justIcon` prop)
- Some components from `src/components/Typography` (instead of these we've added some css to style the normal HTML tags)
  - `src/components/Typography/A.jsx`
  - `src/components/Typography/P.jsx`
  - `src/components/Typography/Small.jsx`
- All the cards from `src/components/Cards`
  - `src/components/Cards/ChartCard.jsx`
  - `src/components/Cards/ProfileCard.jsx`
  - `src/components/Cards/RegularCard.jsx`
  - `src/components/Cards/StatsCard.jsx`
  - `src/components/Cards/TasksCard.jsx`

### Added components

- New card components (`src/components/Card/*`) instead of `src/components/Cards/*`
  - `src/components/Card/Card.jsx`
  - `src/components/Card/CardAvatar.jsx`
  - `src/components/Card/CardBody.jsx`
  - `src/components/Card/CardFooter.jsx`
  - `src/components/Card/CardHeader.jsx`
  - `src/components/Card/CardIcon.jsx`
- `src/components/CustomTabs/CustomTabs.jsx` (instead of `src/components/Cards/TasksCard.jsx`)

### Deleted dependencies

- `material-ui@1.0.0-beta.41`

### Added dependencies

- `@material-ui/core@1.2.1` (instead of `material-ui@1.0.0-beta.41`)
- `@types/googlemaps@3.30.9` to stop the warning: **npm WARN react-google-maps@9.4.5 requires a peer of @types/googlemaps@^3.0.0 but none is installed. You must install peer dependencies yourself.**
- `@types/markerclustererplus@2.1.33` to stop the warning: **npm WARN react-google-maps@9.4.5 requires a peer of @types/markerclustererplus@^2.1.29 but none is installed. You must install peer dependencies yourself.**
- `ajv@6.5.1` to stop the warning: **npm WARN ajv-keywords@3.2.0 requires a peer of ajv@^6.0.0 but none is installed. You must install peer dependencies yourself.**

### Update dependencies

- `@material-ui/icons@1.0.0-beta.42` to `@material-ui/icons@1.1.0`
- `classnames@2.2.5` to `classnames@2.2.6`
- `npm-run-all@4.1.2` to `npm-run-all@4.1.3`
- `perfect-scrollbar@1.3.0` to `perfect-scrollbar@1.4.0`
- `react@16.2.0` to `react@16.4.0`
- `react-dom@16.2.0` to `react-dom@16.4.0`
- `react-router-dom@4.2.2` to `react-router-dom@4.3.1`
- `react-scripts@1.0.17` to `react-scripts@1.1.4`
- `react-swipeable-views@0.12.12` to `react-swipeable-views@0.12.13`

## [1.2.0] 2018-04-16

### Bug Fixing

- Renamed `src/containers/App/App.jsx` to `src/layouts/Dashboard/Dashboard.jsx`
- Renamed `src/variables/styles.jsx` to `src/assets/jss/material-dashboard-react.jsx`
- Moved all the files from `src/variables/styles/` to `src/assets/jss/material-dashboard-react/`
- Changes caused by the upgrade of `material-ui`
- Small bug fixing

### Deleted dependencies

- `material-ui-icons@1.0.0-beta.17`

### Update dependencies

- `material-ui@1.0.0-beta.34` to `material-ui@1.0.0-beta.41`

### Added dependencies

- `@material-ui/icons@1.0.0-beta.42`

## [1.1.0] 2018-02-23

### Bug Fixing

- PerfectScrollbar renders only on windows
- Used [pretier](https://github.com/prettier/prettier) to make the code more readable
- Optimized images sizes
- Changed `classes={root:...}` to `classNames={...}` only where it had `classes={root:...}` and not like `classes={root:..., something:... ,...}`
- Added `classnames()` to avoid doing brittle class name manipulation
- Classes that do not need states were converted to functions
- Moved the style variables in `src/variables/styles.jsx` and all the components styles in `src/variables/styles/{$componentNameStyle}.jsx` files
- Added `-webkit-overflow-scrolling: touch` css for nice scrolling on mobile devices
- Updated to latest `Material-UI` version (from `v1.0.0.beta30` to `v1.0.0.beta34`)

## [1.0.0] 2018-01-29

### Original Release

- Added Material-UI as base framework
- Added design from Material Dashboard by Creative Tim
