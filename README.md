# Pulseboard — HetrixTools Status Pages for Cloudflare Workers

[![Deploy to Cloudflare](https://deploy.workers.cloudflare.com/button)](https://deploy.workers.cloudflare.com/?url=https://github.com/ivLis-Studio/Pulseboard)

Live deployment: [pulse.ivl.is](https://pulse.ivl.is)

Pulseboard turns HetrixTools monitoring data into a clean, UptimeRobot-style status page. Visitors see a public status page; the owner signs in to `/admin` and can manage monitor views and branded public routes.

Source code and releases are maintained at [ivLis-Studio/Pulseboard](https://github.com/ivLis-Studio/Pulseboard).

## What it includes

- `/` — public status page backed by HetrixTools Uptime Monitors.
- `/<slug>` — optional custom public status pages such as `/store` or `/api`.
- `/admin` — private operations dashboard for uptime monitors, blacklist monitors, scheduled maintenance, HetrixTools Status Page membership, account resources, and status-page design.
- Advanced page builder with monitor-level visibility, custom names/groups, navigation controls, section toggles, full colour and layout controls, custom CSS, SEO, localization, and a live preview. The builder stays collapsed until you create or edit a route, and only its first section opens initially.
- Real 30-day availability bars from HetrixTools reports. Hover or keyboard-focus a day to see its date, uptime, downtime count, average response time, and the latest exact check time.
- Complete light and dark appearances, an optional visitor theme switcher, separate palettes, and system-theme detection.
- A public footer credit that links Pulseboard directly to its GitHub repository.
- Same-origin Worker proxy: the HetrixTools API key stays on the server and is never requested from public visitors or admin browsers.
- Signed, HttpOnly admin session cookie after username/password login.
- No API Explorer and no Personal API key login in the product UI.

The Worker uses the [HetrixTools API v3](https://docs.hetrixtools.com/api/v3/) for monitoring data. This project is a status-page product, not a raw API console.

## Admin operations

The administrator works with product-level controls instead of a raw request explorer:

| Workspace | Available operations |
| --------- | -------------------- |
| Uptime monitors | Load 1–30 day or monthly reports, optional hourly website statistics, recent downtimes, location fail logs, server agent ID, and warning policies |
| Server agents | Attach a new agent ID, detach an agent and delete its collected metrics after confirmation, and update the complete warning-policy document |
| Blacklist monitors | Open the current report or request a report for a specific date, including RBL names and delisting links |
| Status Pages | Add and remove Uptime or Blacklist monitors from an existing HetrixTools Status Page, while custom Pulseboard routes remain managed in KV |
| Scheduled maintenance | Create one-time or recurring windows with timezone and notification controls, list every existing window, and remove schedules |
| Account resources | Review account limits, contact-list summaries, and the complete IPv4/domain RBL coverage returned by API v3 |

HetrixTools API v3 does not provide a scheduled-maintenance update endpoint. To change a window, remove it and create a replacement. HetrixTools currently permits up to 10 scheduled maintenance entries per monitor, and a recurring interval must not be shorter than the maintenance window.

## Page customization

Every custom route has its own settings document. A change to `/api` does not affect `/store` or the automatic HetrixTools routes.

| Area                  | Available controls                                                                                                                                              |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Monitor source        | Use one HetrixTools Status Page, all Uptime Monitors, or only selected monitors                                                                                 |
| Per-monitor rules     | Always hide a monitor, include/exclude selected monitors, rename it publicly, assign a custom group, include disabled monitors, sort by API order/name/incident, and override every field below per monitor |
| Header and navigation | Hide the top bar, keep only the brand, hide all Status Pages, show only chosen routes, rename the home link, optionally expose `/admin`                         |
| Page sections         | Independently toggle title, last-checked time, overall banner, announcements, summary counters, monitor heading, group headings, and footer                     |
| Monitor fields        | Independently toggle target, status label, uptime percentage, response time, and the 30-day availability bar globally or for one monitor                       |
| Brand and copy        | Brand name, page title/subtitle, operational/maintenance/incident/unavailable messages, footer, text logo, or uploaded PNG/JPG/WEBP logo                        |
| Appearance            | Light/dark/system themes, two independent eight-colour palettes, visitor switcher, Wanted Sans, SUIT, Pretendard, a custom Google Font, layout, density, width, and radius |
| Publishing            | Korean/English public labels, 0–300 second auto-refresh, SEO title/description, `noindex`, and up to 20 KB of custom CSS                                        |

The monitor picker includes search and bulk actions, and the sandboxed preview updates while settings are edited. “Hide” always wins over the selected monitor list, so one sensitive or internal monitor can be removed from an otherwise broad page.

### Availability history

The public timeline uses `GET /uptime-monitors/{monitor_id}/report` for real daily data instead of generating fake bars. HetrixTools provides daily uptime, downtime count, and response-time aggregates for up to 30 days through this report. It does not expose every historical polling event as an individual timestamp in this response, so Pulseboard labels the timeline as daily history and adds the exact latest `last_check` time to the newest day. History responses are cached briefly to reduce API usage.

The timeline is keyboard accessible: focus any bar to read the same details available on hover. Pages with less than 30 days of report data still render all 30 positions; unavailable days stay neutral and expose an explicit “No uptime data” label. History hydration is limited to three concurrent report requests so a long page does not burst every monitor endpoint at once.

Only one day per monitor enters the normal Tab order. Use Left/Right Arrow, Home, and End to inspect the other days without tabbing through hundreds of markers. The public history endpoint also requires a page-scoped signed token, so a hidden monitor ID cannot be used to query history directly.

Turning off a monitor target is enforced by the Worker, not only by CSS: the URL/IP is removed from the public JSON response. Hidden monitor IDs, internal selection rules, disabled announcements, and navigation pages excluded in the builder are also omitted from the public payload.

### Custom CSS

Custom CSS is appended after Pulseboard's public stylesheet and applies only to the custom route where it was saved. Scope rules under `.public-app` where possible:

```css
.public-app .overall-banner {
  border-width: 2px;
}

.public-app .public-monitor :is(h3, h4) {
  letter-spacing: -0.02em;
}
```

Custom CSS is controlled by the administrator, but CSS can make external requests through features such as `url()`. Only paste CSS you trust.

## Storage model

This project deliberately does not use D1 for the small amount of configuration it needs.

- `CONFIG` — one JSON document in Workers KV containing custom status-page settings.
- `LOGOS` — R2 bucket containing uploaded image logos.
- Worker Secrets — HetrixTools API key, admin username, admin password, and the session-signing secret.

KV is a good fit for a single-owner dashboard with a small settings document. If the product later needs many editors, audit history, relational queries, or high-frequency concurrent writes, D1 can be introduced then.

Availability history is not copied into KV. A public status refresh performs one KV read for the settings document, while daily monitor reports are fetched from HetrixTools and edge-cached for five minutes. Public status responses are cached for 30 seconds, and saving or deleting a page invalidates that page's cache entry.

The admin dashboard loads API resources per workspace instead of requesting every endpoint at login. Contact lists, RBL coverage, and account limits are fetched only when Account resources is opened, which reduces HetrixTools rate-limit usage. Multi-page API results are loaded sequentially for the same reason. On return visits, `/admin` checks the signed session before showing the login form; an expired session clears sensitive dashboard state and returns keyboard focus to the password field. Admin tabs and page-management targets are reflected in the URL, and the builder warns before tab changes, refreshes, sign-out, or other actions discard unsaved edits.

Public and admin navigation remain available on small screens through touch-sized, horizontally scrollable controls. The Worker also starts from a zero-margin document canvas; only the responsive content container adds an intentional reading gutter.

## Deploy with the button

1. Click the Deploy to Cloudflare button above.
2. Let Cloudflare create the Worker, KV namespace, and R2 bucket from `wrangler.toml`.
3. Add the four secrets below in the Cloudflare dashboard or with Wrangler.
4. Open `/admin`, sign in, and create a custom status page.

Cloudflare Deploy buttons can provision supported resources such as KV and R2 and update resource IDs in the generated project. See the [Cloudflare Deploy buttons documentation](https://developers.cloudflare.com/workers/platform/deploy-buttons/).

## Required secrets

The administrator login is completely separate from HetrixTools authentication.

```bash
npx wrangler secret put HETRIXTOOLS_API_KEY
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put DASHBOARD_SESSION_SECRET
```

For the current test setup, use:

```text
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
```

Generate a different password and a long random session secret before making the deployment public:

```bash
openssl rand -hex 32
```

`HETRIXTOOLS_API_KEY` is only used by the Worker when it calls HetrixTools. It is not accepted as an admin password, is not placed in browser storage, and is not rendered in the UI. The [HetrixTools API key documentation](https://docs.hetrixtools.com/api-key/) explains how to rotate it.

`DASHBOARD_SESSION_SECRET` is required because the Worker uses it to sign and verify the administrator's session cookie. It is not another password you type into the UI. Generate it once, keep it private, and rotate it when you want to invalidate every existing admin session.

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars
# Keep the local values as admin / admin for now, then add your HetrixTools test key.
npm run worker:dev
```

`.dev.vars` is ignored by Git. A local file can look like this:

```dotenv
HETRIXTOOLS_API_KEY=replace-with-your-test-key
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin
DASHBOARD_SESSION_SECRET=local-development-session-secret
```

Then open:

- `http://localhost:8787/`
- `http://localhost:8787/admin`

Run the syntax and production-build checks before publishing:

```bash
npm run check
```

The local Worker uses Wrangler's local KV/R2 emulation. No D1 migration or database setup is required.

## Direct deployment with Wrangler

The Deploy button is the easiest route for a new Cloudflare account because it can provision the storage resources. For an already configured project:

```bash
npm run build
npx wrangler deploy
```

Set the secrets before opening the public route. The Worker expects these bindings:

```toml
[[kv_namespaces]]
binding = "CONFIG"

[[r2_buckets]]
binding = "LOGOS"
```

## Admin security model

1. The browser posts the admin username and password to `/api/admin/login`.
2. The Worker verifies them against `ADMIN_USERNAME` and `ADMIN_PASSWORD`.
3. The Worker returns a signed `HttpOnly; SameSite=Strict` session cookie.
4. Admin monitor requests and page-builder writes require that cookie.
5. The Worker adds `HETRIXTOOLS_API_KEY` only when calling HetrixTools.

Changing `DASHBOARD_SESSION_SECRET` invalidates existing sessions. Use the sign-out action or rotate the secret after changing administrator credentials.

## Project layout

```text
.
├── worker.js            # Auth, HetrixTools proxy, public status API, KV/R2 routes
├── wrangler.toml        # Worker, KV, R2, and static asset bindings
├── src/
│   ├── main.js          # Product entrypoint
│   ├── productApp.js    # Public status page and admin dashboard
│   └── product.css      # Clean, gradient-free visual system
├── public/favicon.svg
└── .dev.vars.example
```

## 한국어 안내

Pulseboard는 HetrixTools의 모니터링 데이터를 UptimeRobot과 비슷한 공개 Status Page로 보여주는 Cloudflare Worker 앱입니다.

실제 배포 주소: [pulse.ivl.is](https://pulse.ivl.is)

- `/` — 공개 상태 페이지
- `/<slug>` — `/store`, `/api` 같은 커스텀 상태 페이지
- `/admin` — 모니터, 장애, 점검, 상태 페이지 디자인을 관리하는 관리자 화면

### 관리자 API 기능

관리자 화면은 원시 API 요청기가 아니라 실제 운영 작업에 맞춘 UI로 구성되어 있습니다.

- Uptime Monitor별 1~30일/월간 리포트, 시간대, 시간별 웹 통계, 다운타임, 지역 실패 로그 조회
- Server Monitoring Agent ID 생성/연결, 수집 지표 삭제를 포함한 연결 해제, 전체 Warning Policy JSON 조회/저장
- Blacklist Monitor의 현재 또는 지정 날짜 리포트와 RBL별 해제 링크 조회
- 기존 HetrixTools Status Page에 Uptime/Blacklist Monitor 추가 및 제거
- 시간대와 알림 설정을 포함한 일회성/반복 Scheduled Maintenance 생성, 전체 목록 조회, 삭제
- 계정 사용 한도, Contact List 요약, IPv4/Domain RBL 전체 목록 조회

HetrixTools API v3에는 Scheduled Maintenance 수정 API가 없습니다. 시간을 바꾸려면 기존 예약을 삭제한 다음 새로 생성해야 합니다. Monitor 하나에는 최대 10개의 예약 점검을 둘 수 있으며, 반복 간격은 점검 시간보다 짧게 설정할 수 없습니다.

관리자 로그인은 HetrixTools API key로 하지 않습니다. `ADMIN_USERNAME`과 `ADMIN_PASSWORD`로 로그인하고, Worker가 서명한 HttpOnly 세션 쿠키를 발급합니다. HetrixTools API key는 `HETRIXTOOLS_API_KEY` Worker Secret에만 남으며 브라우저 입력란이나 localStorage에 저장되지 않습니다.

현재 테스트 계정은 다음처럼 설정하면 됩니다.

```text
아이디: admin
비밀번호: admin
```

실서비스를 공개하기 전에는 반드시 비밀번호를 변경하세요.

간단한 상태 페이지 설정을 저장하기 위해 D1은 사용하지 않습니다. 설정 JSON은 `CONFIG` KV에 저장하고 이미지 로고 파일만 `LOGOS` R2에 저장합니다. 따라서 마이그레이션 명령이나 데이터베이스 스키마 관리가 필요 없습니다.

30일 가동률 기록은 KV에 복제하지 않습니다. 공개 상태 갱신 한 번당 설정 JSON을 읽는 KV read는 1회이며, HetrixTools 일간 리포트는 엣지에서 5분간 캐시합니다. 공개 상태 응답은 30초간 캐시되고 해당 페이지 설정을 저장하거나 삭제하면 그 페이지의 캐시를 즉시 비웁니다.

### 상태 페이지 커스터마이징

각 `/<slug>` 페이지마다 아래 항목을 독립적으로 저장할 수 있습니다.

- HetrixTools Status Page 하나, 전체 Uptime Monitor, 직접 선택한 Monitor 중 데이터 소스 선택
- 특정 Monitor만 항상 숨기기, 선택 목록 일괄 관리, 공개 이름 변경, 공개 그룹 변경, 정렬 방식 선택
- 상단바 전체 숨김, 내비게이션만 숨김, HetrixTools/커스텀 Status Page 목록 숨김, 특정 페이지만 내비게이션에 표시
- 제목, 마지막 확인 시각, 전체 상태, 공지, 요약 숫자, Monitor 제목/그룹, Footer를 각각 켜고 끄기
- Monitor 주소, 상태 문구, Uptime, 응답 시간, 30일 가동률 막대를 전체 또는 Monitor별로 각각 켜고 끄기
- 브랜드명과 모든 주요 문구, 텍스트 로고 또는 이미지 로고, 한국어/영어 공개 문구 설정
- 라이트/다크/시스템 모드, 방문자용 테마 전환 버튼, 모드별 8가지 색상 팔레트 설정
- Wanted Sans, SUIT, Pretendard, 기본 Sans/Serif/Mono 및 원하는 Google Fonts 글꼴 사용
- 상태 타임라인 중심의 기본 디자인, 여백 밀도, 콘텐츠 너비, 모서리 반경 설정
- 자동 새로고침, SEO 제목/설명, 검색엔진 숨김, 페이지별 Custom CSS 적용
- Monitor 검색과 일괄 선택 도구, 라이트/다크/미니멀 프리셋, 실시간 미리보기

`Hide`로 지정한 Monitor는 전체 또는 선택 Monitor 모드와 상관없이 최종 공개 페이지에서 제외됩니다. Custom CSS는 해당 커스텀 경로에만 적용되며 최대 20KB입니다. 외부 `url()` 등이 포함된 신뢰할 수 없는 CSS는 붙여 넣지 마세요.

공개 페이지의 30일 막대는 HetrixTools 모니터 리포트에서 받은 실제 일간 집계입니다. 막대에 마우스를 올리거나 키보드로 포커스하면 날짜, Uptime, 장애 횟수, 평균 응답 시간과 최신 정확한 확인 시각을 볼 수 있습니다. 리포트 API는 과거의 모든 개별 측정 이벤트 시각을 한 건씩 반환하지 않으므로, 막대 하나는 측정 한 번이 아니라 하루를 나타냅니다. 데이터가 30일보다 적어도 30칸을 유지하고 없는 날짜는 회색으로 표시하며 “가동률 데이터 없음”으로 안내합니다. 긴 페이지에서 API 요청이 한꺼번에 몰리지 않도록 기록 조회는 최대 3개만 동시에 진행합니다.

키보드 사용자는 각 Monitor의 최신 막대만 Tab으로 진입한 뒤 좌우 방향키, Home, End로 날짜를 이동할 수 있습니다. Monitor 주소를 숨기면 화면에서만 가리는 것이 아니라 Worker가 공개 JSON에서 URL/IP를 제거합니다. 숨긴 Monitor ID와 내부 선택 규칙도 공개 응답에 포함하지 않습니다.

설정 빌더는 Status pages 탭에 들어갔다고 바로 긴 폼을 펼치지 않습니다. 새 페이지를 만들거나 기존 페이지를 편집할 때만 열리며, 첫 섹션만 기본으로 펼쳐집니다. 저장이 실패해도 입력 중인 설정·점검 일정·Status Page 선택·Warning Policy JSON은 그대로 유지됩니다. 저장하지 않은 설정이 있을 때 탭 이동, 새로고침, 로그아웃, 다른 편집 화면 진입을 시도하면 먼저 폐기 여부를 확인합니다. 관리자 탭과 Status Page 관리 대상은 URL에 반영되므로 새로고침하거나 관리 링크로 직접 들어가도 같은 화면이 열립니다. 관리자 세션 복원 확인 중에는 로그인 폼이 잠깐 나타나지 않으며, 세션이 만료되면 민감한 화면 상태를 비우고 비밀번호 입력란으로 포커스를 돌려보냅니다. 여러 페이지로 나뉜 API 결과는 순서대로 불러와 HetrixTools 요청이 순간적으로 몰리지 않게 합니다.

모바일에서도 공개 페이지 경로, 관리자 메뉴, 공개 페이지 보기, 로그아웃을 숨기지 않고 44px 이상의 터치 영역으로 제공합니다. 문서 자체의 기본 margin/padding은 0이며, 화면 가장자리의 여백은 읽기 편하도록 콘텐츠 컨테이너에만 적용한 반응형 거터입니다.

공개 Status Page Footer의 Pulseboard 표기는 [GitHub 저장소](https://github.com/ivLis-Studio/Pulseboard)로 연결됩니다. Footer를 숨긴 페이지에서는 이 링크도 함께 숨겨집니다.

`DASHBOARD_SESSION_SECRET`은 관리자 세션 쿠키를 위조할 수 없게 서명하는 키이므로 필요합니다. 로그인 화면에 입력하는 값은 아니며, 한 번 무작위 문자열로 생성해 Worker Secret에 보관하면 됩니다. 이 값을 바꾸면 기존 관리자 로그인 세션이 모두 만료됩니다.

### 한국어 로컬 실행

```bash
npm install
cp .dev.vars.example .dev.vars
npm run worker:dev
```

`.dev.vars`에는 테스트용으로 `ADMIN_USERNAME=admin`, `ADMIN_PASSWORD=admin`을 넣으면 됩니다. HetrixTools 키와 세션 서명 Secret은 GitHub에 올리면 안 됩니다.

### Cloudflare 배포

README 상단의 Deploy to Cloudflare 버튼을 누르면 이 GitHub 저장소를 기준으로 Worker와 KV/R2 리소스를 구성할 수 있습니다. 배포 후 Cloudflare Worker Secrets에 아래 네 가지를 등록합니다.

```bash
npx wrangler secret put HETRIXTOOLS_API_KEY
npx wrangler secret put ADMIN_USERNAME
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put DASHBOARD_SESSION_SECRET
```

## License

Pulseboard is released under the [MIT License](LICENSE).
