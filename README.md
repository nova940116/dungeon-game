# 화살 던전 (Arrow Dungeon)

Three.js로 만든 2.5D 탑다운 아처 로그라이트.
3D로 렌더링하지만, 이동·충돌·전투는 모두 바닥 평면(x/z) 위의 2D 로직으로 처리합니다.

## 실행

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 타입체크 + 프로덕션 빌드 (dist/)
npm run preview    # 빌드 결과 미리보기
npm test           # 유닛 테스트 (Vitest)
npm run assets     # 외부 에셋 다운로드 + 최적화 → public/assets (결과물은 이미 포함됨)
npm run assets:archer  # 블렌더로 궁수 캐릭터(활 리그 + 활 애니메이션) 빌드 — assets 다음에 실행
npm run assets:bosses  # 블렌더로 보스 2종(모델·리그·애니메이션 전부 코드로 직접 제작) 빌드 — 원본 에셋 불필요
```

## 에셋

모든 외부 에셋은 **CC0(퍼블릭 도메인)** 이며 출처는 [`CREDITS.md`](CREDITS.md)에 자동 기록됩니다.

| 종류 | 출처 | 내용 |
|---|---|---|
| 몬스터 (애니메이션 포함) | [Quaternius](https://quaternius.com) via poly.pizza | 슬라임, 박쥐, 버섯, 거인 |
| 보스 2종 (직접 제작) | 블렌더 스크립트(`scripts/blender/boss_*.py`)로 메시·뼈대·애니메이션을 처음부터 생성 | 고대 골렘(중간 보스), 심연의 마왕(스테이지 보스) |
| 궁수 플레이어 | Quaternius의 King(판금 갑옷 몸) + Adventurer(수염 머리) + 활·화살을 블렌더 스크립트로 합성 | 근육질 영웅 체형 + 활 리그 + 활 쏘기 애니메이션 4종 (직접 제작) |
| 소품·환경 | Quaternius via poly.pizza | 활, 화살, 돌벽, 바위, 나무(소나무/눈/야자/고목), 선인장, 덤불, 크리스탈, 횃불, 해골 등 |
| 바닥 PBR 텍스처 | [Poly Haven](https://polyhaven.com) | 테마별 바닥/지면 (diffuse + normal) |
| 환경광 HDRI | Poly Haven | 하늘 HDRI (조명 반사용) |
| 파티클 텍스처 | 코드로 생성 | glow / star / ring / smoke / portal (`src/assets/vfxTextures.ts`) |
| 효과음 (29종 · 50파일) | [OpenGameArt](https://opengameart.org) — rubberduck의 CC0 SFX 팩 5종, artisticdude의 RPG Sound Pack | 활 시위, 화살 명중/치명타/막힘, 몬스터별 공격·사망, 보스 포효·내려찍기·돌진, 보석 획득, 레벨업, 방 클리어, UI |

**에셋 파이프라인** (`scripts/fetch-assets.mjs`)
1. `scripts/asset-sources.json`에 적힌 모델/텍스처를 다운로드 (`.asset-cache/`에 캐시)
2. 라이선스가 CC0인지 검증 — 아니면 빌드 실패
3. 모델은 `gltf-transform optimize`로 텍스처 512px WebP 변환·중복 제거 (원본 ~25MB → 6MB)
4. 텍스처는 512px WebP로 리사이즈
5. 효과음은 zip에서 추출 → 앞부분 무음 제거 → 피크 -1dB 정규화 → 모노 MP3(96kbps) 변환 (ffmpeg-static, 전체 ~470KB)
6. `CREDITS.md` 재생성

새 에셋 추가: `asset-sources.json`에 한 줄 추가 → `npm run assets` → `src/assets/AssetManifest.ts`에 키 등록.

## 그래픽 파이프라인

- **렌더링**: ACES 톤매핑 + HDRI 환경광 + 그림자 + **Bloom 후처리** (HDR 값 > 1.0만 빛남: 화살 궤적, 탄환, 횃불, 포털, 크리스탈)
- **캐릭터**: 스키닝 애니메이션 (대기/달리기/피격/사망), 크로스페이드, 원샷 애니메이션 후 루프 복귀 (`AnimatedModel`)
- **영웅 캐릭터** (블렌더로 제작, `scripts/blender/hero.py`)
  - 같은 리그를 쓰는 두 캐릭터를 합성: 왕의 판금 갑옷 몸 + 모험가의 수염 머리 (얼굴 방향 자동 보정)
  - 영웅 비율: 넓은 어깨·가슴, 굵은 팔·목, 좁은 허리(V자), 작은 머리 — 뼈 스케일로 변형 후 "현재 포즈를 기본 포즈로" 적용해서 기존 애니메이션이 그대로 동작
  - 위팔 소매를 피부로 바꿔 맨팔 이두근 노출, 플랫 셰이딩(각진 면), 강철 + 크림슨 팔레트, 등에 화살통(화살 꽂힘)
  - 수정: `hero.py` 상단 `PROPORTIONS`(부위별 배율) / `PALETTE`(색) → `npm run assets:archer`
- **보스 모델** (블렌더로 제작, `scripts/blender/boss_golem.py` · `boss_demon.py` · 공용 도구 `bosskit.py`)
  - 외부 모델 없이 상자·기둥·가시 같은 조각을 코드로 쌓아 만들고, 조각마다 뼈 하나에 붙여 리깅
  - 모든 뼈가 같은 방향을 보게 해서 애니메이션을 "캐릭터 기준 각도"로 직접 작성 (걷기·공격·포효·사망 등)
  - 발광 재질(`Crystal`/`Glow`/`Eye`)은 게임에서 페이즈에 따라 밝기가 맥동
  - 수정: 각 파일의 `build()`(형태·색) / `animate()`(동작) → `npm run assets:bosses -- --preview` (포즈 시트가 `.asset-cache/boss-preview/`에 렌더링됨)
- **궁수 애니메이션** (블렌더로 제작, `scripts/blender/build_archer.py`)
  - 원본 캐릭터에 활 리그를 추가: `Bow`(왼손 손잡이) → `BowTop`/`BowBottom`(휘는 활대), `Nock`(시위 당기는 점), `Arrow`(걸린 화살)
  - 활대는 당기는 만큼 휘고, 시위는 손가락을 따라 V자로 당겨지며, 화살은 시위에 걸려 있다가 발사 순간 사라짐
  - 클립: `Bow_Idle`(활 낮게 든 대기·호흡) · `Bow_Draw`(사격 자세 + 턱 밑까지 당기기) · `Bow_Hold`(만작 유지·호흡) · `Bow_Release`(줄 튕김 → 손 뒤로 빠짐 → 다시 화살 걸기)
  - 사격 자세: 측면 스탠스(발 벌림), 골반·척추 회전, 머리는 표적 응시, 활 쥔 손/시위 거는 손가락 포즈
  - 원본 뼈가 매우 짧아 블렌더 IK를 쓸 수 없어서, 2본 IK를 스크립트로 풀어 매 프레임 키를 구움
  - 게임에서는 `Player`가 조준 → Draw(다음 발사 시점에 맞춰 속도 조절) → Hold → 발사 시 Release 순서로 재생
  - 수정: `build_archer.py` 상단 `T`(스탠스·활 기울기·활대 휨 등) 또는 각 클립 함수 → `npm run assets:archer` (`--preview`로 포즈 렌더링)
- **이펙트**: 풀링된 스프라이트 파티클 (`EffectsSystem`) — 타격 스파크, 치명타, 사망 연기, 소환진, 충격파, 레벨업, 발자국 먼지, 화살 궤적
- **분위기**: 테마별 앰비언트 파티클 (숲: 반딧불 / 사막: 먼지 / 얼음: 눈 / 용암: 불씨), 깜빡이는 횃불 조명

## 사운드

- **AudioManager** (`src/audio/`): Web Audio 기반. 첫 입력 시 오디오 잠금 해제, 탭 숨기면 일시정지
  - 사운드별 쿨다운·최대 동시 재생 수 → 화살 20발이 동시에 맞아도 소음이 되지 않음
  - 랜덤 피치 + 직전과 다른 변형 선택 → 반복음이 기계적으로 들리지 않음
  - 좌우 패닝(아레나 x 위치), 마스터 컴프레서로 클리핑 방지
- **AudioSystem** (`src/systems/AudioSystem.ts`): 게임 이벤트 → 효과음 매핑. 게임 로직은 이벤트만 발행하고 오디오를 직접 호출하지 않음
  - 보석을 연달아 먹으면 음이 점점 올라감 (콤보 피드백)
- 음소거: HUD 🔊 버튼 또는 `M` 키 (설정 저장됨)
- 볼륨/피치/쿨다운 튜닝: `src/audio/SoundManifest.ts`

## 조작

- 이동: `WASD` / 방향키, 모바일은 화면 드래그(가상 조이스틱)
- 멈춰 서면 가장 가까운 적에게 자동 사격
- 일시정지: `Esc` / `P` 또는 HUD ⏸ 버튼 (탭을 벗어나거나 창이 포커스를 잃으면 자동 일시정지). 일시정지 화면에서 계속하기 · 처음부터 다시 · 메인 메뉴 (되돌릴 수 없는 버튼은 두 번 눌러 확인)
- 방을 정리하면 위쪽 문이 열림 · 5·15·25…번째 방은 중간 보스(고대 골렘), 10·20·30…번째 방은 스테이지 보스(심연의 마왕)
- 보스는 등장 연출·전용 체력바·체력 구간별 페이즈가 있고, 바닥에 예고되는 장판 공격을 사용
- 화면 왼쪽 위: 현재 능력치(공격력 · 초당 공격 · 치명타 · 한 번에 쏘는 화살 수)와 보유 스킬(●○ 단계, 최대 단계는 금색 테두리)

## 프로젝트 구조

```
src/
├─ main.ts                  # 엔트리 포인트
├─ config.ts                # 밸런스/카메라/엔진 상수 (튜닝은 여기서)
├─ audio/                   # AudioManager(재생·보이스 제한·음소거), SoundManifest(사운드 표)
├─ engine/                  # 게임과 무관한 범용 엔진 레이어
│  ├─ Engine.ts             #   렌더러·씬·조명·메인 루프
│  ├─ Input.ts              #   키보드 + 가상 조이스틱
│  ├─ CameraRig.ts          #   고정 각도 추적 카메라, 화면 흔들림
│  └─ EventBus.ts           #   타입 안전한 이벤트 버스
├─ game/
│  ├─ Game.ts               # 컴포지션 루트 + 상태 머신 (menu/playing/paused/skillPick/...)
│  ├─ World.ts              # 현재 방의 엔티티 컨테이너 + 스폰/데미지 헬퍼
│  └─ events.ts             # 게임 이벤트 타입 정의
├─ world/
│  ├─ Room.ts               # 방(바닥, 벽, 바위, 문, 횃불, 장식) + 방 단위 충돌
│  ├─ AmbientParticles.ts   # 테마별 분위기 파티클
│  ├─ RoomGenerator.ts      # 절차적 바위 배치·적 웨이브 생성
│  └─ Collision.ts          # 원-AABB 충돌, 시야(Line of Sight)
├─ entities/
│  ├─ Player.ts, PlayerStats.ts
│  ├─ Enemy.ts              # 적 베이스 클래스 (스폰/피격/접촉 데미지)
│  ├─ enemies/              # Slime, Bat, Shooter, Golem, MidBoss, Boss(+BossEnemy/BossAura) + 팩토리
│  ├─ projectiles/          # Arrow, EnemyBullet
│  └─ XpOrb.ts
├─ systems/                 # 프레임마다 World를 갱신하는 로직
│  ├─ AudioSystem.ts        #   게임 이벤트 → 효과음
│  ├─ WeaponSystem.ts       #   멈추면 자동 사격, 타겟팅, 화살 패턴
│  ├─ CombatSystem.ts       #   투사체 이동·피격·반사·관통·치명타
│  ├─ EnemySystem.ts        #   적 AI 실행 + 겹침 방지
│  ├─ PickupSystem.ts       #   경험치 구슬 자석/획득
│  ├─ ProgressionSystem.ts  #   경험치·레벨·스킬 드래프트
│  └─ EffectsSystem.ts      #   파티클
├─ assets/                  # 에셋 로딩·인스턴싱
│  ├─ AssetManifest.ts      #   모든 모델/텍스처 경로, 크기 정규화, 애니메이션 클립 매핑
│  ├─ AssetLibrary.ts       #   일괄 로딩(진행률), 스케일/피벗 정규화, 클론, PMREM 환경맵
│  ├─ AnimatedModel.ts      #   스키닝 모델 + 애니메이션 상태(루프/원샷/피격 플래시)
│  ├─ ModelKit.ts           #   공유 리소스 등록, 안전한 dispose
│  ├─ sharedResources.ts    #   투사체/UI 공용 지오메트리·머티리얼
│  ├─ vfxTextures.ts        #   파티클 텍스처 생성
│  └─ models/               #   Environment(벽/바위/횃불/포털), Projectile, HealthBar
├─ data/                    # 데이터 테이블 (코드 수정 없이 콘텐츠 추가)
│  ├─ enemies.ts            #   적 스탯, 방별 등장 테이블
│  ├─ skills.ts             #   스킬 정의
│  └─ themes.ts             #   챕터별 테마
├─ ui/                      # DOM UI
│  ├─ Hud.ts, Screens.ts, DamageNumbers.ts, dom.ts
├─ utils/                   # math, storage
└─ styles/main.css
tests/                      # Vitest 유닛 테스트 (충돌, 방 생성, 성장)
```

## 아키텍처 메모

- **레이어 의존 방향**: `engine` ← `game` ← `systems`/`entities` ← `data`/`assets`. 엔진은 게임을 모릅니다.
- **World + Systems**: 엔티티는 상태와 자기 AI만 갖고, 시스템이 World를 순회하며 상호작용(피격, 획득 등)을 처리합니다.
- **이벤트 기반 피드백**: 전투 로직은 `enemy:damaged`, `player:damaged` 같은 이벤트만 발행하고, 데미지 숫자·화면 흔들림·HUD는 `Game`에서 구독해 처리합니다. 사운드를 붙일 때도 이벤트 구독만 추가하면 됩니다.
- **데이터 주도**: 새 스킬은 `data/skills.ts`에 한 줄, 새 적은 `data/enemies.ts` + `entities/enemies/`에 클래스 하나 + 팩토리 등록이면 끝입니다.
- **리소스 관리**: 화살·총알처럼 많이 생기는 객체는 공유 지오메트리/머티리얼을 쓰고, 방을 나갈 때 `disposeObject`로 GPU 리소스를 해제합니다.

## 콘텐츠 추가 예시

**스킬 추가** — `src/data/skills.ts`
```ts
{ id: 'myskill', icon: '🔥', name: '새 스킬', description: '설명', maxStacks: 1, apply: (p) => { p.stats.damage *= 1.5; } },
```
(`SkillId` 유니온 타입에도 id 추가)

**적 추가** — `scripts/asset-sources.json`에 모델 추가 후 `npm run assets` → `AssetManifest.ts`에 크기·클립 매핑 등록 → `data/enemies.ts`에 스탯 정의 → `entities/enemies/NewEnemy.ts`에서 `Enemy`를 상속해 `think()` 구현 → `entities/enemies/index.ts` 레지스트리에 등록.
