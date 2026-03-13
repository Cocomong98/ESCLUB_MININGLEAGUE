# Deploy Assets

루트 혼잡을 줄이기 위해 배포 보조 파일을 이 폴더로 모았습니다.

## 파일

- `deploy/docker-compose.example.yaml`
- `deploy/.htaccess`
- `deploy/genezio.yaml`

## 사용 원칙

1. 운영 런타임 필수 파일(`app.py`, `admin/`, `config/`, `data/`, `build/`)과 분리 관리합니다.
2. 관리자 정적 자산은 `admin/` 폴더(`admin/admin.html`, `admin/admin-panel.js`) 기준으로 운영합니다.
3. 배포 플랫폼별 보조 설정이 필요할 때만 이 폴더의 파일을 참조합니다.
