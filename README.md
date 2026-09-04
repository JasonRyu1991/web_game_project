# 1bit.kr

메이플식 횡스크롤 협력 방치형 MMO. 채널(=파드) 1개당 정원 5명.

**한 문장 명제**: WebSocket 세션이 붙은 stateful 워크로드를 어떻게 유저를 안 튕기고 스케일 인 / 배포하는가.

라이브: https://1bit.kr

## 구성

| 경로 | 역할 |
|---|---|
| `field/` | 게임 클라이언트+채널 서버(Node, WebSocket). [field/README.md](field/README.md)에 게임 규칙 상세 |
| `k8s/` | GKE 매니페스트(채널 StatefulSet, Redis, KEDA, Ingress) |
| `*.tf` | Terraform — VPC, GKE, 노드풀, Cloud SQL, WIF, DNS 등 GCP 인프라 전체 |
| `.github/workflows/deploy.yml` | CI/CD — `main` push 시 빌드·배포 자동화 |
| `modeling/` | 스프라이트 원본 시트(생성형 AI로 제작, `field/{mob,gear,char,fx,bg}/`로 추출) |

## 인프라 한눈에

- **GCP 단독** (`personal-webgame-project`, `asia-northeast3`), 도메인 `1bit.kr`
- **노드풀 2개**: `web-game-core`(온디맨드, redis·홈채널·KEDA 상주) + `web-game-node-pool`(스팟, sub 채널 버스트)
- **채널**: `channel-main-0`(홈, core 고정, 항상 1개) + `channel-1~4`(sub, KEDA가 인원 보고 1~4개 조절)
- **Redis**: 채널 명부(TTL 하트비트) + 드레인 시 세션 이관 버퍼
- **Cloud SQL(Postgres)**: `accounts`(로그인) · `saves`(캐릭터) · `chats`(채팅 로그)
- **드레인**: 파드가 죽기 전 SIGTERM → 접속자 상태를 Redis에 park → 다른 채널이 claim해 이어붙임(무중단)

## 로컬 실행

```
cd field && npm ci
node server.js   # http://localhost:8080
```

Redis·Cloud SQL 없이도 뜬다 — 없으면 채널 명부·이관·계정·세이브 기능만 꺼진다.

## 테스트

```
node field/test.js   # 코어 규칙(레벨업, 장비, 드레인 이관 등) 26건 검증
```

## 배포

`main`에 `field/**` 또는 `k8s/**` 변경분을 push하면 GitHub Actions가 자동으로:

1. `field/` 스모크 테스트
2. WIF로 GCP 인증 (키 파일 없음)
3. `docker build --platform linux/amd64` → Artifact Registry push (태그 = 커밋 SHA)
4. `kubectl set image`로 `channel-main`·`channel` 두 StatefulSet 롤아웃

수동으로 하려면 `.github/workflows/deploy.yml`의 스텝을 그대로 로컬에서 순서대로 실행하면 된다(`gcloud`/`kubectl` 인증만 로컬 계정으로 대체).

## 주의

- 계정(`accounts`)·세이브(`saves`)는 Cloud SQL 저장. `db-credentials` Secret에 `DATABASE_URL`이 없으면 로그인/저장 전체가 조용히 실패한다.
- `terraform.tfvars`, Secret `db-credentials`는 git에 없다. 새 환경에서는 재입력·재생성 필요.
