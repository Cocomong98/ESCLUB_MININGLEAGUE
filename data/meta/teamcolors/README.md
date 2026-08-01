# FC ONLINE 팀컬러 메타데이터

- 수집 기준일: 2026-07-31
- 스키마 버전: 1.0.0
- 출처: https://fconline.nexon.com/datacenter/teamcolor
- 핵심 조인: `matchInfo.spPlayer[].spId = teamcolor_players.spid`

## 파일

| 파일 | 내용 | 기본 키 |
|---|---|---|
| `team_colors.csv` | 팀컬러 기본정보 | `teamcolor_id` |
| `activation_stages.csv` | 단계별 필요 선수 수 | `teamcolor_id`, `stage` |
| `effects.csv` | 단계별 능력치 효과 | `teamcolor_id`, `stage`, `stat_code` |
| `teamcolor_players.csv` | 팀컬러와 시즌 선수 관계 | `teamcolor_id`, `spid` |
| `players.csv` | 시즌 선수 확인용 정보 | `spid` |
| `manifest.json` | 스키마·수집 시각·건수·조인 계약 | - |
| `FCONLINE_teamcolor_metadata_20260731.xlsx` | 위 데이터를 시트별로 구성한 통합 문서 | - |

## 데이터 건수

| 데이터 | 건수 |
|---|---:|
| 팀컬러 | 643 |
| 적용 단계 | 1,434 |
| 단계별 효과 | 3,020 |
| 팀컬러-선수 관계 | 55,739 |
| 고유 시즌 선수 | 19,013 |

## 구현 규칙

1. Open API 매치 상세의 `spId`를 `teamcolor_players.spid`와 직접 조인한다.
2. 스쿼드에 포함된 `spid`와 팀컬러별 적용 선수 집합의 교집합 인원을 계산한다.
3. `activation_stages.required_players` 이하인 단계 중 최고 단계를 활성 단계로 선택한다.
4. 활성 단계에 해당하는 `effects`만 적용한다.
5. 메타데이터가 없거나 스키마 검증에 실패하면 팀컬러 계산만 비활성화한다.
6. 금빛·은빛·동빛·백금빛 물결과 초심자 가호는 강화 등급 기반이므로 `teamcolor_players` 관계가 없다.
7. `teamcolor_id=40679`인 `Step Higher`는 공식 웹 선수 목록 응답 자체가 빈 배열이므로 관계 데이터가 없다.
