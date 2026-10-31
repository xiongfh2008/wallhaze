// Waffo audit remediation: align public copy with the real service state —
// AI creation, Credits purchase are PLANNED features, not available now.
// Idempotent: re-running converges. Run: node scripts/i18n-audit-fix.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];

// Per-locale copy. The en values follow the reviewer's recommended wording;
// other locales are faithful translations of the same meaning.
const C = {
  en: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "Design it. Generate it. — Coming Soon", "siBody": "The Studio will be WallHaze's creative workspace: describe what you want to see, pick a signature style, dial in the exact ratio and resolution for your device — and keep the result in your personal library. AI creation is not currently available; it opens after its official launch.", "siCta": "Preview the Studio", "step2Title": "Create your own in Studio (coming soon)", "step2Body": "AI-powered creation is being finalized and is not currently available. Watch the Studio for the launch announcement.", "ctaButton": "Start Creating (soon)"},
    studioComingEyebrow: "AI Creation",
    heroSubtitle:
      "Explore free wallpapers for every screen — AI-powered wallpaper creation is coming soon.",
    heroFootnote:
      "Free gallery browsing · downloads for cleared artwork · AI creation coming soon",
    aboutAiBody:
      "AI wallpaper creation is a planned feature and is not currently available to the public. We are preparing AI-powered tools for personalized static wallpapers and short animated wallpapers. In the meantime, you can browse and download the wallpapers in our collection.",
    termsServiceBody:
      "WallHaze currently provides access to curated digital wallpapers for browsing and downloading: a gallery of static wallpapers, live wallpaper demos and a community gallery of creator submissions published after human review. AI-powered wallpaper creation, including static image generation and short animated wallpaper generation, is a planned feature and is not currently available to the public. The availability, pricing, and applicable terms of these features will be communicated when they are officially launched. Features may be added, changed or discontinued over time; the pages of the site reflect the services that are currently available.",
    termsAiBody:
      "AI-powered wallpaper creation is a planned feature and is not currently available to the public. When this feature officially launches, generations will be produced by third-party AI model services from the prompt and settings you provide. Similar prompts can produce similar results; we do not promise that a generation is unique or free of resemblance to existing works, and we do not represent that AI output is free of third-party rights. You will be responsible for the prompts you enter and for using the results in line with these terms. Generated media will be kept under the retention described in the Privacy Policy. Broader usage rights will be described here if and when they are introduced.",
    termsCreditsBody:
      "Credits are WallHaze's planned prepaid balance for AI wallpaper creation. Credits purchases are not yet available — the pricing shown on this site is planned for launch and may be updated before purchasing becomes available. When the feature officially launches, a generation will reserve and consume Credits according to the price shown before you confirm it, Credits will be tied to your account and cannot be transferred between accounts, and refund handling will be stated at the point of purchase. These provisions apply once Credits purchasing becomes available.",
    privacyPlannedTitle: "AI wallpaper generation (planned)",
    privacyPlannedBody:
      "AI wallpaper generation is not currently available to the public. When this feature becomes available, users may submit text prompts, reference images, and generation preferences. We will provide information about the applicable data processing practices and third-party service providers before the feature is launched. The descriptions below cover the processing this feature will involve once it is available.",
    privacyScreeningBody:
      "Planned feature: when AI wallpaper generation launches, prompts will be screened by an automated content-safety service before any generation is sent to an AI model. Blocked or unscreenable requests will not be generated. Screening logs will contain the job identifier, the decision and, where reported, a violation category — not the prompt text and not your credentials.",
    faq3Q: "What is the AI Studio?",
    faq3A: "The AI Studio is our planned creation feature: you will describe a wallpaper in your own words, pick a style, device and aspect ratio, and optionally add a reference image. It is not currently available to the public — see the next question.",
    faq4Q: "What are Credits?",
    faq4A: "Credits will be WallHaze's prepaid balance for AI wallpaper creation. Credits purchases are not yet available — the pricing shown on the site is planned for launch and may change before purchasing opens.",
    faq5Q: "Why is generation not open yet?",
    faq5A: "AI-powered wallpaper creation is being finalized together with our payment and content-safety integrations. It will open to the public once everything is verified — watch this page and the Studio for the announcement.",
    faq8A: "Not for the gallery — browsing and downloading cleared wallpapers needs no account. Accounts will be required for AI creation and the Credits wallet once those features officially launch.",
    helpStudioTitle: "AI Studio — Coming Soon",
    helpStudioBody:
      "We are preparing AI-powered wallpaper creation features, including personalized static wallpapers and short animated wallpapers. These creation features are not currently available to the public. In the meantime, you can browse and download available wallpapers from our collection.",
    metaStudioTitle: "Studio — AI Wallpaper Creation (Coming Soon)",
    metaStudioDescription:
      "WallHaze's AI wallpaper creation is coming soon. In the meantime, browse and download free wallpapers for phone, tablet and desktop.",
    footerTagline:
      "Wallpapers made for your device — explore the collection, with AI creation coming soon.",
    pricingNote:
      "AI Credits purchases are not yet available. The pricing shown is planned for launch and may be updated before purchasing becomes available.",
    liveDemoAiNote:
      "WallHaze platform demos — original AI-generated live wallpapers, not user-generated results · silent · looping · free to watch",
    studioAiTitle: "AI creation — coming soon",
    studioAiBody:
      "We are preparing our AI wallpaper creation features. In the meantime, you can explore and download available wallpapers. AI creation will be available after its official launch.",
    studioComingTitle: "AI Creation — Coming Soon",
    studioComingBody:
      "We are preparing our AI wallpaper creation features. In the meantime, you can explore and download available wallpapers. AI creation will be available after its official launch.",
    studioComingCta: "Creation currently unavailable",
  },
  zh: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "设计它。生成它。— 即将开放", "siBody": "Studio 将是 WallHaze 的创作工作区：描述你想看到的画面，选择标志性风格，为你的设备设定精确的比例与分辨率——并将结果保存到个人库。AI 创作目前尚未开放，正式发布后开放。", "siCta": "预览 Studio", "step2Title": "在 Studio 创作自己的壁纸（即将开放）", "step2Body": "AI 创作正在最终完善，目前尚未开放。请关注 Studio 页面的开放公告。", "ctaButton": "开始创作（即将开放）"},
    studioComingEyebrow: "AI 创作",
    heroSubtitle: "探索适配各种屏幕的免费壁纸——AI 壁纸创作即将开放。",
    heroFootnote: "免费画廊浏览 · 已授权作品下载 · AI 创作即将开放",
    aboutAiBody:
      "AI 壁纸创作为计划推出功能，目前尚未向公众开放。我们正在完善个性化静态壁纸与短视频动态壁纸的 AI 创作能力。当前你可以免费浏览和下载平台提供的壁纸。",
    termsServiceBody:
      "WallHaze 目前提供精选数字壁纸的浏览与下载服务：静态壁纸画廊、动态壁纸演示，以及经人工审核后发布的创作者作品社区画廊。AI 壁纸创作（包括静态图片生成与短视频动态壁纸生成）为计划推出功能，目前尚未向公众开放。相关功能的开放时间、价格及适用条款将在正式上线时公布。功能可能随时间增加、变更或终止；网站页面反映当前实际可用的服务。",
    termsAiBody:
      "AI 壁纸创作为计划推出功能，目前尚未向公众开放。该功能正式上线后，生成结果将由第三方 AI 模型服务根据你提供的提示词与设置产生。相似提示词可能产生相似结果；我们不承诺生成结果唯一或与既有作品无相似之处，也不声明 AI 输出不存在第三方权利。届时你需对自己输入的提示词及结果的使用方式负责。生成内容将按隐私政策所述的保留期限保存。更广泛的使用授权将在推出时在此说明。",
    termsCreditsBody:
      "Credits 是 WallHaze 计划推出的 AI 壁纸创作预付余额。Credits 购买尚未开放——本站展示的价格为计划价格，正式开放购买前可能调整。功能正式上线后：生成将按确认前展示的价格预留并消耗 Credits；Credits 与账户绑定，不可在账户间转移；退款处理方式将在购买开放时于购买页说明。以上条款自 Credits 购买开放之日起适用。",
    privacyPlannedTitle: "AI 壁纸生成（计划推出）",
    privacyPlannedBody:
      "AI 壁纸生成目前尚未向公众开放。该功能开放后，用户可能提交文本提示词、参考图与生成偏好。我们将在功能上线前公布适用的数据处理方式与第三方服务商。以下描述为该功能上线后将涉及的数据处理。",
    privacyScreeningBody:
      "计划功能：AI 壁纸生成上线后，提示词将在生成发送至 AI 模型之前经过自动化内容安全服务筛查。被拦截或无法筛查的请求不会被生成。筛查日志将包含任务标识、判定结果与（如报告）违规类别——不包含提示词文本，也不包含你的凭据。",
    faq3Q: "什么是 AI Studio？",
    faq3A: "AI Studio 是我们计划推出的创作功能：你将可以用自己的话描述壁纸，选择风格、设备与宽高比，并可选添加参考图。该功能目前尚未向公众开放——见下一问。",
    faq4Q: "什么是 Credits？",
    faq4A: "Credits 将是 WallHaze 用于 AI 壁纸创作的预付余额。Credits 购买尚未开放——站内展示的价格为计划价格，正式开放前可能调整。",
    faq5Q: "为什么生成还没有开放？",
    faq5A: "AI 壁纸创作正在与支付及内容安全集成一起做最终完善，全部验证通过后才会向公众开放。请关注本页与 Studio 页面的开放公告。",
    faq8A: "浏览画廊不需要账户——浏览与下载已授权壁纸无需登录。AI 创作与 Credits 钱包在正式上线后需要账户。",
    helpStudioTitle: "AI Studio — 即将开放",
    helpStudioBody:
      "我们正在完善 AI 壁纸创作功能，包括个性化静态壁纸与短视频动态壁纸。这些创作功能目前尚未向公众开放。当前你可以免费浏览和下载平台提供的壁纸。",
    metaStudioTitle: "Studio — AI 壁纸创作（即将开放）",
    metaStudioDescription:
      "WallHaze 的 AI 壁纸创作即将开放。当前可免费浏览与下载手机、平板、桌面壁纸。",
    footerTagline: "为你的设备打造的壁纸——探索作品集，AI 创作即将开放。",
    pricingNote:
      "AI Credits 购买尚未开放。本页展示的价格为计划价格，正式开放购买前可能调整。",
    liveDemoAiNote:
      "WallHaze 平台演示——原创 AI 生成动态壁纸，非用户实时生成结果 · 无声 · 循环播放 · 免费观看",
    studioAiTitle: "AI 创作 — 即将开放",
    studioAiBody:
      "我们正在完善 AI 壁纸创作功能。当前可以免费浏览和下载平台提供的壁纸。AI 创作功能正式开放后即可体验。",
    studioComingTitle: "AI 创作即将开放",
    studioComingBody:
      "我们正在完善 AI 壁纸创作服务。目前可以免费浏览和下载平台提供的壁纸。AI 创作功能正式开放后即可体验。",
    studioComingCta: "创作功能暂未开放",
  },
  ja: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "デザインして。生成する。— 近日公開", "siBody": "Studio は WallHaze の创作ワークスペース（予定）です：見たいものを描写し、署名スタイルを選び、端末に合わせた比率と解像度を設定 — 結果は個人ライブラリに保存。AI创作は現在未開放で、正式リリース後に開放されます。", "siCta": "Studioをプレビュー", "step2Title": "Studioで自分の壁紙をつくる（近日公開）", "step2Body": "AI创作は最終調整中で、現在は未開放です。Studioのリリース告知をご覧ください。", "ctaButton": "创作を始める（近日公開）"},
    studioComingEyebrow: "AI创作",
    heroSubtitle: "あらゆる画面に合う無料壁紙を探索 — AI壁紙创作は近日公開。",
    heroFootnote: "無料ギャラリー閲覧 · 承認済み作品のダウンロード · AI创作は近日公開",
    aboutAiBody:
      "AI壁紙创作は計画中の機能で、現在は一般公開されていません。パーソナルな静止画壁紙や短いライブ壁紙のためのAI機能を準備中です。それまでの間、コレクションの壁紙を無料で閲覧・ダウンロードできます。",
    termsServiceBody:
      "WallHaze は現在、厳選されたデジタル壁紙の閲覧・ダウンロードサービスを提供しています：静止画壁紙ギャラリー、ライブ壁紙デモ、人による審査後に公開されるクリエイター作品のコミュニティギャラリー。AI壁紙创作（静止画生成および短いライブ壁紙生成を含む）は計画中の機能で、現在は一般公開されていません。これらの機能の提供時期、価格、適用される規約は正式リリース時に告知します。機能は追加・変更・終了することがあります。サイトのページは現在利用可能なサービスを反映します。",
    termsAiBody:
      "AI壁紙创作は計画中の機能で、現在は一般公開されていません。正式リリース後、生成結果は入力されたプロンプトと設定に基づきサードパーティのAIモデルサービスによって生成されます。類似のプロンプトは類似の結果を生むことがあります。生成結果の唯一性や既存作品との類似の不存在を保証せず、第三者の権利を侵害しないことも表明しません。プロンプトの入力と結果の利用は利用者自身の責任で行っていただきます。生成メディアはプライバシーポリシーに記載の保持期間に従い保持します。より広い利用権は導入時にここで説明します。",
    termsCreditsBody:
      "Credits は AI壁紙创作向けの予定されているプリペイド残高です。Credits の購入はまだ利用できません — サイトに表示されている価格はリリース計画に基づくもので、購入開始前に変更される場合があります。正式リリース後：生成は確認前に表示された価格に従い Credits を確保・消費します。Credits はアカウントに紐づき、アカウント間の移転はできません。返金の扱いは購入開始時に購入画面で説明します。これらの規定は Credits 購入の開始後に適用されます。",
    privacyPlannedTitle: "AI壁紙生成（計画中）",
    privacyPlannedBody:
      "AI壁紙生成は現在一般公開されていません。この機能が利用可能になると、テキストプロンプト、参照画像、生成設定を送信できるようになります。機能リリース前に、適用されるデータ処理とサードパーティサービス提供者に関する情報を提供します。以下はリリース後にこの機能が行うデータ処理の説明です。",
    privacyScreeningBody:
      "計画中の機能：AI壁紙生成のリリース後、プロンプトは生成がAIモデルに送信される前に自動コンテンツ安全サービスで審査されます。ブロックまたは審査不能なリクエストは生成されません。審査ログにはジョブ識別子・判定・（報告された場合は）違反カテゴリが含まれ、プロンプト本文や認証情報は含まれません。",
    faq3Q: "AI Studio とは？",
    faq3A: "AI Studio は計画中の创作機能です：自分の言葉で壁紙を描写し、スタイル・デバイス・アスペクト比を選び、必要に応じて参照画像を追加できます。現在は一般公開されていません — 次の質問をご覧ください。",
    faq4Q: "Credits とは？",
    faq4A: "Credits は AI壁紙创作向けの予定されているプリペイド残高です。Credits の購入はまだ利用できません — サイト表示の価格は計画価格で、購入開始前に変更される場合があります。",
    faq5Q: "なぜ生成はまだ開放されていないのですか？",
    faq5A: "AI壁紙创作は決済およびコンテンツ安全の統合とともに最終調整中です。すべての検証が完了した後に一般公開されます。このページと Studio の公開告知をご覧ください。",
    faq8A: "ギャラリーにはアカウント不要です — 承認済み壁紙の閲覧とダウンロードはログインなしで利用できます。AI创作と Credits ウォレットは正式リリース後にアカウントが必要になります。",
    helpStudioTitle: "AI Studio — 近日公開",
    helpStudioBody:
      "パーソナルな静止画壁紙や短いライブ壁紙を含む AI壁紙创作機能を準備中です。これらの创作機能は現在一般公開されていません。それまでの間、コレクションの壁紙を閲覧・ダウンロードできます。",
    metaStudioTitle: "Studio — AI壁紙创作（近日公開）",
    metaStudioDescription:
      "WallHaze のAI壁紙创作は近日公開。それまでの間、スマホ・タブレット・デスクトップ用の無料壁紙を閲覧・ダウンロードできます。",
    footerTagline: "あなたの端末のための壁紙 — コレクションを探索、AI创作は近日公開。",
    pricingNote:
      "Credits の購入はまだ利用できません。表示中の価格はリリース計画に基づくもので、購入開始前に変更される場合があります。",
    liveDemoAiNote:
      "WallHaze プラットフォームデモ — オリジナルのAI生成ライブ壁紙（利用者のリアルタイム生成結果ではありません）· 無音 · ループ · 視聴無料",
    studioAiTitle: "AI创作 — 近日公開",
    studioAiBody:
      "AI壁紙创作機能を準備中です。それまでの間、プラットフォーム提供の壁紙を無料で閲覧・ダウンロードできます。正式リリース後にご利用いただけます。",
    studioComingTitle: "AI创作 — 近日公開",
    studioComingBody:
      "AI壁紙创作サービスを準備中です。現在はプラットフォーム提供の壁紙を無料で閲覧・ダウンロードできます。正式リリース後にご利用いただけます。",
    studioComingCta: "创作機能は未開放",
  },
  ko: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "디자인하고. 생성하세요. — 곧 개장", "siBody": "Studio는 WallHaze의创作 워크스페이스(예정)입니다: 보고 싶은 것을 묘사하고, 시그니처 스타일을 선택하고, 기기에 맞는 비율과 해상도를 설정 — 결과는 개인 라이브러리에 저장됩니다. AI创作은 현재 미개방이며 정식 출시 후 열립니다.", "siCta": "Studio 미리보기", "step2Title": "Studio에서 내 배경화면 만들기 (곧 개장)", "step2Body": "AI创作은 마무리 중이며 현재 미개방입니다. Studio의 개시 공지를 확인하세요.", "ctaButton": "创作 시작 (곧 개장)"},
    studioComingEyebrow: "AI creation",
    heroSubtitle: "모든 화면에 맞는 무료 배경화면을 탐색하세요 — AI 배경화면创作이 곧 열립니다.",
    heroFootnote: "무료 갤러리 탐색 · 승인된 작품 다운로드 · AI创作 곧 개장",
    aboutAiBody:
      "AI 배경화면创作은 계획 중인 기능으로 현재 일반 공개되지 않았습니다. 개인화된 정적 배경화면과 짧은 라이브 배경화면을 위한 AI 기능을 준비하고 있습니다. 그동안 컬렉션의 배경화면을 무료로 탐색하고 다운로드할 수 있습니다.",
    termsServiceBody:
      "WallHaze는 현재 엄선된 디지털 배경화면의 탐색과 다운로드를 제공합니다: 정적 배경화면 갤러리, 라이브 배경화면 데모, 사람의 검토 후 공개되는 크리에이터 작품 커뮤니티 갤러리. AI 배경화면创作(정적 이미지 생성 및 짧은 라이브 배경화면 생성 포함)은 계획 중인 기능으로 현재 일반 공개되지 않았습니다. 이러한 기능의 제공 시기, 가격, 적용 약관은 정식 출시 시 안내됩니다. 기능은 추가·변경·중단될 수 있으며 사이트 페이지는 현재 이용 가능한 서비스를 반영합니다.",
    termsAiBody:
      "AI 배경화면创作은 계획 중인 기능으로 현재 일반 공개되지 않았습니다. 정식 출시 후 생성 결과는 입력한 프롬프트와 설정에 따라 서드파티 AI 모델 서비스에서 생성됩니다. 유사한 프롬프트는 유사한 결과를 낼 수 있으며, 생성 결과의 고유성이나 기존 저작물과의 무관성을 보장하지 않고 AI 출력에 제3자 권리가 없다고 진술하지 않습니다. 프롬프트 입력과 결과 사용은 이용자 책임입니다. 생성 미디어는 개인정보처리방침에 따라 보관됩니다. 더 넓은 이용 권한은 도입 시 여기에 설명됩니다.",
    termsCreditsBody:
      "Credits는 AI 배경화면创作을 위한 예정된 선불 잔액입니다. Credits 구매는 아직 불가능합니다 — 사이트에 표시된 가격은 계획 가격이며 구매 개시 전에 변경될 수 있습니다. 정식 출시 후: 생성은 확인 전 표시된 가격에 따라 Credits를 예약·소비하며, Credits는 계정에 귀속되어 계정 간 이전이 불가하고, 환불 처리는 구매 개시 시 구매 화면에 안내됩니다. 이 조항들은 Credits 구매가 개시된 후 적용됩니다.",
    privacyPlannedTitle: "AI 배경화면 생성 (계획)",
    privacyPlannedBody:
      "AI 배경화면 생성은 현재 일반 공개되지 않았습니다. 이 기능이 제공되면 텍스트 프롬프트, 참조 이미지, 생성 설정을 제출할 수 있습니다. 기능 출시 전에 적용되는 데이터 처리 방식과 서드파티 서비스 제공사에 대한 정보를 안내드립니다. 아래는 해당 기능이 개시 후 수행할 데이터 처리에 대한 설명입니다.",
    privacyScreeningBody:
      "계획 기능: AI 배경화면 생성이 개시되면 프롬프트가 AI 모델로 전송되기 전 자동 콘텐츠 안전 서비스로 심사됩니다. 차단되었거나 심사 불가한 요청은 생성되지 않습니다. 심사 로그에는 작업 식별자, 판정, (보고된 경우) 위반 카테고리가 기록되며 프롬프트 본문이나 인증 정보는 포함되지 않습니다.",
    faq3Q: "AI Studio란?",
    faq3A: "AI Studio는 계획 중인创作 기능입니다: 자신의 말로 배경화면을 묘사하고 스타일, 기기, 화면비를 선택하며 필요시 참조 이미지를 추가할 수 있습니다. 현재 일반 공개되지 않았습니다 — 다음 질문을 참고하세요.",
    faq4Q: "Credits란?",
    faq4A: "Credits는 AI 배경화면创作을 위한 예정된 선불 잔액입니다. Credits 구매는 아직 불가능합니다 — 사이트 표시 가격은 계획 가격이며 개시 전에 변경될 수 있습니다.",
    faq5Q: "생성이 아직 개방되지 않은 이유는?",
    faq5A: "AI 배경화면创作은 결제 및 콘텐츠 안전 통합과 함께 최종 마무리 중입니다. 모든 검증이 완료되면 일반에 개방됩니다. 이 페이지와 Studio의 개시 공지를 확인하세요.",
    faq8A: "갤러리에는 계정이 필요 없습니다 — 승인된 배경화면 탐색과 다운로드는 로그인 없이 이용할 수 있습니다. AI创作과 Credits 지갑은 정식 출시 후 계정이 필요합니다.",
    helpStudioTitle: "AI Studio — 곧 개장",
    helpStudioBody:
      "개인화된 정적 배경화면과 짧은 라이브 배경화면을 포함한 AI 배경화면创作 기능을 준비 중입니다. 이创作 기능은 현재 일반 공개되지 않았습니다. 그동안 컬렉션의 배경화면을 탐색하고 다운로드하세요.",
    metaStudioTitle: "Studio — AI 배경화면创作 (곧 개장)",
    metaStudioDescription:
      "WallHaze의 AI 배경화면创作이 곧 개장합니다. 그동안 모바일·태블릿·데스크톱 무료 배경화면을 탐색하고 다운로드하세요.",
    footerTagline: "당신의 기기를 위한 배경화면 — 컬렉션을 탐색하고, AI创作은 곧 개장합니다.",
    pricingNote:
      "AI Credits 구매는 아직 불가능합니다. 표시된 가격은 계획 가격이며 구매 개시 전에 변경될 수 있습니다.",
    liveDemoAiNote:
      "WallHaze 플랫폼 데모 — 오리지널 AI 생성 라이브 배경화면(이용자 실시간 생성 결과가 아님) · 무음 · 반복 · 무료 시청",
    studioAiTitle: "AI创作 — 곧 개장",
    studioAiBody:
      "AI 배경화면创作 기능을 준비 중입니다. 그동안 플랫폼 제공 배경화면을 무료로 탐색하고 다운로드할 수 있습니다. 정식 출시 후 이용할 수 있습니다.",
    studioComingTitle: "AI创作 — 곧 개장",
    studioComingBody:
      "AI 배경화면创作 서비스를 준비 중입니다. 현재는 플랫폼 제공 배경화면을 무료로 탐색하고 다운로드할 수 있습니다. 정식 출시 후 이용할 수 있습니다.",
    studioComingCta: "创作 기능 미개방",
  },
  es: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "Diséñalo. Genéralo. — Próximamente", "siBody": "El Studio será el espacio creativo de WallHaze: describe lo que quieres ver, elige un estilo distintivo, ajusta la proporción y resolución exactas para tu dispositivo — y guarda el resultado en tu biblioteca personal. La creación con IA no está disponible actualmente; abrirá tras su lanzamiento oficial.", "siCta": "Previsualizar el Studio", "step2Title": "Crea tu propio fondo en el Studio (próximamente)", "step2Body": "La creación con IA se está finalizando y no está disponible actualmente. Atento al Studio para el anuncio de lanzamiento.", "ctaButton": "Empieza a crear (pronto)"},
    studioComingEyebrow: "Creación con IA",
    heroSubtitle: "Explora fondos gratuitos para cada pantalla — la creación de fondos con IA llegará pronto.",
    heroFootnote: "Navegación gratuita por la galería · descargas de arte autorizado · creación con IA próximamente",
    aboutAiBody:
      "La creación de fondos con IA es una función planificada y no está disponible actualmente al público. Estamos preparando herramientas de IA para fondos estáticos personalizados y fondos dinámicos cortos. Mientras tanto, puedes explorar y descargar los fondos de nuestra colección.",
    termsServiceBody:
      "WallHaze ofrece actualmente acceso a fondos digitales seleccionados para su exploración y descarga: una galería de fondos estáticos, demos de fondos dinámicos y una galería comunitaria de envíos de creadores publicados tras revisión humana. La creación de fondos con IA, incluida la generación de imágenes estáticas y de fondos dinámicos cortos, es una función planificada y no está disponible actualmente al público. La disponibilidad, el precio y los términos aplicables de estas funciones se comunicarán cuando se lancen oficialmente. Las funciones pueden añadirse, cambiar o discontinuarse con el tiempo; las páginas del sitio reflejan los servicios disponibles actualmente.",
    termsAiBody:
      "La creación de fondos con IA es una función planificada y no está disponible actualmente al público. Cuando esta función se lance oficialmente, las generaciones serán producidas por servicios de modelos de IA de terceros a partir del prompt y la configuración que proporciones. Prompts similares pueden producir resultados similares; no prometemos que una generación sea única o libre de parecidos con obras existentes, ni afirmamos que el resultado de la IA esté libre de derechos de terceros. Serás responsable de los prompts que introduzcas y del uso de los resultados conforme a estos términos. Los medios generados se conservarán según la retención descrita en la Política de privacidad. Derechos de uso más amplios se describirán aquí si se introducen.",
    termsCreditsBody:
      "Los Credits serán el saldo prepagado planificado de WallHaze para la creación de fondos con IA. La compra de Credits aún no está disponible — los precios mostrados en este sitio son planificados y pueden actualizarse antes de que la compra esté disponible. Cuando la función se lance oficialmente, una generación reservará y consumirá Credits según el precio mostrado antes de confirmar, los Credits estarán vinculados a tu cuenta y no podrán transferirse entre cuentas, y el manejo de reembolsos se indicará en el punto de compra. Estas disposiciones se aplican cuando la compra de Credits esté disponible.",
    privacyPlannedTitle: "Generación de fondos con IA (planificada)",
    privacyPlannedBody:
      "La generación de fondos con IA no está disponible actualmente al público. Cuando esta función esté disponible, los usuarios podrán enviar prompts de texto, imágenes de referencia y preferencias de generación. Proporcionaremos información sobre las prácticas de tratamiento de datos aplicables y los proveedores de servicios de terceros antes del lanzamiento. Las descripciones siguientes cubren el tratamiento que esta función implicará una vez disponible.",
    privacyScreeningBody:
      "Función planificada: cuando la generación de fondos con IA se lance, los prompts se examinarán con un servicio automatizado de seguridad de contenido antes de enviarse a un modelo de IA. Las solicitudes bloqueadas o no examinables no se generarán. Los registros de revisión contendrán el identificador del trabajo, la decisión y, si se reporta, una categoría de infracción — no el texto del prompt ni tus credenciales.",
    faq3Q: "¿Qué es el AI Studio?",
    faq3A: "El AI Studio es nuestra función de creación planificada: describirás un fondo con tus propias palabras, elegirás estilo, dispositivo y relación de aspecto y, opcionalmente, añadirás una imagen de referencia. No está disponible actualmente al público — ver la pregunta siguiente.",
    faq4Q: "¿Qué son los Credits?",
    faq4A: "Los Credits serán el saldo prepagado de WallHaze para la creación de fondos con IA. La compra de Credits aún no está disponible — los precios mostrados son planificados y pueden cambiar antes de que la compra abra.",
    faq5Q: "¿Por qué la generación no está abierta todavía?",
    faq5A: "La creación de fondos con IA se está finalizando junto con nuestras integraciones de pago y seguridad de contenido. Se abrirá al público cuando todo esté verificado — atento a esta página y al Studio.",
    faq8A: "No para la galería — explorar y descargar fondos autorizados no requiere cuenta. Las cuentas serán necesarias para la creación con IA y la cartera de Credits cuando esas funciones se lancen oficialmente.",
    helpStudioTitle: "AI Studio — Próximamente",
    helpStudioBody:
      "Estamos preparando funciones de creación de fondos con IA, incluidos fondos estáticos personalizados y fondos dinámicos cortos. Estas funciones de creación no están disponibles actualmente al público. Mientras tanto, puedes explorar y descargar los fondos disponibles de nuestra colección.",
    metaStudioTitle: "Studio — Creación de fondos con IA (próximamente)",
    metaStudioDescription:
      "La creación de fondos con IA de WallHaze llega pronto. Mientras tanto, explora y descarga fondos gratuitos para móvil, tablet y escritorio.",
    footerTagline: "Fondos hechos para tu dispositivo — explora la colección, con la creación con IA próximamente.",
    pricingNote:
      "La compra de AI Credits aún no está disponible. Los precios mostrados son planificados para el lanzamiento y pueden actualizarse antes de que la compra esté disponible.",
    liveDemoAiNote:
      "Demos de la plataforma WallHaze — fondos dinámicos originales generados por IA, no resultados generados por usuarios · silenciosos · en bucle · gratis",
    studioAiTitle: "Creación con IA — próximamente",
    studioAiBody:
      "Estamos preparando nuestras funciones de creación de fondos con IA. Mientras tanto, puedes explorar y descargar los fondos disponibles. La creación con IA estará disponible tras su lanzamiento oficial.",
    studioComingTitle: "Creación con IA — Próximamente",
    studioComingBody:
      "Estamos preparando nuestro servicio de creación de fondos con IA. Mientras tanto, puedes explorar y descargar los fondos disponibles. La creación con IA estará disponible tras su lanzamiento oficial.",
    studioComingCta: "La creación no está disponible",
  },
  fr: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "Décrivez-le. Générez-le. — Bientôt", "siBody": "Le Studio sera l'espace créatif de WallHaze : décrivez ce que vous voulez voir, choisissez un style signature, réglez le ratio et la résolution exacts pour votre appareil — et gardez le résultat dans votre bibliothèque personnelle. La création par IA n'est pas disponible actuellement ; elle ouvrira après son lancement officiel.", "siCta": "Aperçu du Studio", "step2Title": "Créez votre fond dans le Studio (bientôt)", "step2Body": "La création par IA est en cours de finalisation et n'est pas disponible actuellement. Surveillez le Studio pour l'annonce de lancement.", "ctaButton": "Commencer à créer (bientôt)"},
    studioComingEyebrow: "Création par IA",
    heroSubtitle: "Explorez des fonds gratuits pour chaque écran — la création de fonds par IA arrive bientôt.",
    heroFootnote: "Navigation gratuite dans la galerie · téléchargements d’œuvres autorisées · création par IA bientôt disponible",
    aboutAiBody:
      "La création de fonds par IA est une fonctionnalité planifiée et n’est pas disponible actuellement au public. Nous préparons des outils d’IA pour des fonds statiques personnalisés et de courts fonds animés. En attendant, vous pouvez parcourir et télécharger les fonds de notre collection.",
    termsServiceBody:
      "WallHaze propose actuellement l’accès à des fonds numériques sélectionnés pour la navigation et le téléchargement : une galerie de fonds statiques, des démos de fonds animés et une galerie communautaire de soumissions de créateurs publiées après vérification humaine. La création de fonds par IA, y compris la génération d’images statiques et de fonds animés courts, est une fonctionnalité planifiée et n’est pas disponible actuellement au public. La disponibilité, le prix et les conditions applicables de ces fonctionnalités seront communiqués lors de leur lancement officiel. Des fonctionnalités peuvent être ajoutées, modifiées ou interrompues ; les pages du site reflètent les services actuellement disponibles.",
    termsAiBody:
      "La création de fonds par IA est une fonctionnalité planifiée et n’est pas disponible actuellement au public. Lors de son lancement officiel, les générations seront produites par des services de modèles d’IA tiers à partir du prompt et des réglages que vous fournirez. Des prompts similaires peuvent produire des résultats similaires ; nous ne promettons pas qu’une génération soit unique ou exempte de ressemblances avec des œuvres existantes, et nous ne déclarons pas que le résultat de l’IA est exempt de droits de tiers. Vous serez responsable des prompts saisis et de l’utilisation des résultats conformément à ces conditions. Les médias générés seront conservés selon la rétention décrite dans la Politique de confidentialité. Des droits d’usage plus étendus seront décrits ici le cas échéant.",
    termsCreditsBody:
      "Les Credits seront le solde prépayé planifié de WallHaze pour la création de fonds par IA. L’achat de Credits n’est pas encore disponible — les prix affichés sur ce site sont planifiés et peuvent évoluer avant l’ouverture des achats. Lors du lancement officiel, une génération réservera et consommera des Credits selon le prix affiché avant confirmation, les Credits seront liés à votre compte et non transférables, et le traitement des remboursements sera indiqué au point d’achat. Ces dispositions s’appliqueront une fois l’achat de Credits ouvert.",
    privacyPlannedTitle: "Génération de fonds par IA (planifiée)",
    privacyPlannedBody:
      "La génération de fonds par IA n’est pas disponible actuellement au public. Lorsque cette fonctionnalité sera disponible, les utilisateurs pourront soumettre des prompts de texte, des images de référence et des préférences de génération. Nous fournirons des informations sur les pratiques de traitement applicables et les fournisseurs de services tiers avant le lancement. Les descriptions ci-dessous couvrent le traitement que cette fonctionnalité impliquera une fois disponible.",
    privacyScreeningBody:
      "Fonctionnalité planifiée : lorsque la génération de fonds par IA sera lancée, les prompts seront examinés par un service automatisé de sécurité du contenu avant tout envoi à un modèle d’IA. Les demandes bloquées — ou impossibles à examiner — ne seront pas générées. Les journaux d’examen contiendront l’identifiant du travail, la décision et, le cas échéant, une catégorie de violation — ni le texte du prompt ni vos identifiants.",
    faq3Q: "Qu’est-ce que l’AI Studio ?",
    faq3A: "L’AI Studio est notre fonctionnalité de création planifiée : vous décrirez un fond avec vos propres mots, choisirez un style, un appareil et un rapport d’aspect, et ajouterez éventuellement une image de référence. Elle n’est pas disponible actuellement au public — voir la question suivante.",
    faq4Q: "Que sont les Credits ?",
    faq4A: "Les Credits seront le solde prépayé planifié de WallHaze pour la création de fonds par IA. L’achat de Credits n’est pas encore disponible — les prix affichés sont planifiés et peuvent changer avant l’ouverture des achats.",
    faq5Q: "Pourquoi la génération n’est-elle pas encore ouverte ?",
    faq5A: "La création de fonds par IA est en cours de finalisation avec nos intégrations de paiement et de sécurité du contenu. Elle s’ouvrira au public une fois tout vérifié — surveillez cette page et le Studio.",
    faq8A: "Pas pour la galerie — parcourir et télécharger les fonds autorisés ne nécessite pas de compte. Les comptes seront requis pour la création par IA et le portefeuille de Credits lorsque ces fonctionnalités seront officiellement lancées.",
    helpStudioTitle: "AI Studio — Bientôt disponible",
    helpStudioBody:
      "Nous préparons des fonctionnalités de création de fonds par IA, notamment des fonds statiques personnalisés et de courts fonds animés. Ces fonctionnalités de création ne sont pas disponibles actuellement au public. En attendant, vous pouvez parcourir et télécharger les fonds disponibles de notre collection.",
    metaStudioTitle: "Studio — Création de fonds par IA (bientôt disponible)",
    metaStudioDescription:
      "La création de fonds par IA de WallHaze arrive bientôt. En attendant, parcourez et téléchargez des fonds gratuits pour mobile, tablette et ordinateur.",
    footerTagline: "Des fonds faits pour votre appareil — explorez la collection, la création par IA arrive bientôt.",
    pricingNote:
      "L’achat de Credits IA n’est pas encore disponible. Les prix affichés sont planifiés pour le lancement et peuvent être mis à jour avant l’ouverture des achats.",
    liveDemoAiNote:
      "Démos de la plateforme WallHaze — fonds animés originaux générés par IA, pas des résultats générés par les utilisateurs · silencieux · en boucle · gratuits",
    studioAiTitle: "Création par IA — bientôt disponible",
    studioAiBody:
      "Nous préparons nos fonctionnalités de création de fonds par IA. En attendant, vous pouvez parcourir et télécharger les fonds disponibles. La création par IA sera disponible après son lancement officiel.",
    studioComingTitle: "Création par IA — Bientôt disponible",
    studioComingBody:
      "Nous préparons notre service de création de fonds par IA. En attendant, vous pouvez explorer et télécharger les fonds disponibles. La création par IA sera disponible après son lancement officiel.",
    studioComingCta: "La création n’est pas disponible",
  },
  de: {
    homeIntro: {"eyebrow": "AI Studio", "siTitle": "Gestalten. Generieren. — Kommt bald", "siBody": "Das Studio wird WallHazes kreativer Arbeitsbereich sein: beschreibe, was du sehen willst, wähle einen Signature-Stil, stelle Ratio und Auflösung exakt für dein Gerät ein — und behalte das Ergebnis in deiner persönlichen Bibliothek. Die KI-Erstellung ist derzeit nicht verfügbar; sie öffnet nach dem offiziellen Launch.", "siCta": "Studio-Vorschau", "step2Title": "Im Studio dein eigenes Wallpaper erstellen (kommt bald)", "step2Body": "Die KI-Erstellung wird finalisiert und ist derzeit nicht verfügbar. Beachte das Studio für die Launch-Ankündigung.", "ctaButton": "Jetzt crear (bald)"},
    studioComingEyebrow: "KI-Erstellung",
    heroSubtitle: "Entdecke kostenlose Wallpaper für jeden Bildschirm — KI-Wallpaper-Erstellung kommt bald.",
    heroFootnote: "Kostenlose Galerie · Downloads freigegebener Werke · KI-Erstellung kommt bald",
    aboutAiBody:
      "Die KI-Wallpaper-Erstellung ist eine geplante Funktion und derzeit nicht öffentlich verfügbar. Wir bereiten KI-Tools für personalisierte statische Wallpaper und kurze Live-Wallpaper vor. In der Zwischenzeit kannst du die Wallpaper unserer Sammlung kostenlos ansehen und herunterladen.",
    termsServiceBody:
      "WallHaze bietet derzeit Zugriff auf kuratierte digitale Wallpaper zum Ansehen und Herunterladen: eine Galerie statischer Wallpaper, Live-Wallpaper-Demos und eine Community-Galerie von nach menschlicher Prüfung veröffentlichten Einsendungen. Die KI-Wallpaper-Erstellung, einschließlich statischer Bildgenerierung und kurzer Live-Wallpaper-Generierung, ist eine geplante Funktion und derzeit nicht öffentlich verfügbar. Verfügbarkeit, Preise und geltende Bedingungen dieser Funktionen werden bei ihrer offiziellen Einführung mitgeteilt. Funktionen können hinzukommen, sich ändern oder eingestellt werden; die Seiten der Website spiegeln die derzeit verfügbaren Dienste wider.",
    termsAiBody:
      "Die KI-Wallpaper-Erstellung ist eine geplante Funktion und derzeit nicht öffentlich verfügbar. Nach ihrer offiziellen Einführung werden Generierungen von Drittanbieter-KI-Modelldiensten aus dem Prompt und den Einstellungen erzeugt, die du angibst. Ähnliche Prompts können ähnliche Ergebnisse liefern; wir garantieren weder die Einzigartigkeit einer Generierung noch deren Frei von Ähnlichkeiten mit bestehenden Werken und erklären nicht, dass KI-Ergebnisse frei von Rechten Dritter sind. Du wirst für die eingegebenen Prompts und die Nutzung der Ergebnisse gemäß diesen Bedingungen verantwortlich sein. Generierte Medien werden gemäß der in der Datenschutzerklärung beschriebenen Aufbewahrung gespeichert. Weitergehende Nutzungsrechte werden hier beschrieben, sobald sie eingeführt werden.",
    termsCreditsBody:
      "Credits sind das geplante Prepaid-Guthaben von WallHaze für die KI-Wallpaper-Erstellung. Der Kauf von Credits ist noch nicht möglich — die auf dieser Website gezeigten Preise sind Planpreise und können sich vor der Verfügbarkeit von Käufen ändern. Nach der offiziellen Einführung wird eine Generierung Credits gemäß dem vor Bestätigung angezeigten Preis reservieren und verbrauchen, Credits an dein Konto gebunden und nicht auf andere Konten übertragbar sein, und die Refund-Abwicklung wird am Kaufpunkt beschrieben. Diese Bestimmungen gelten, sobald der Credits-Kauf verfügbar ist.",
    privacyPlannedTitle: "KI-Wallpaper-Generierung (geplant)",
    privacyPlannedBody:
      "Die KI-Wallpaper-Generierung ist derzeit nicht öffentlich verfügbar. Sobald diese Funktion verfügbar ist, können Nutzer Text-Prompts, Referenzbilder und Generierungseinstellungen übermitteln. Wir werden vor dem Launch über die anwendbaren Datenverarbeitungspraktiken und Drittanbieter informieren. Die folgenden Beschreibungen betreffen die Datenverarbeitung, die diese Funktion nach Verfügbarkeit umfassen wird.",
    privacyScreeningBody:
      "Geplante Funktion: Nach dem Launch der KI-Wallpaper-Generierung werden Prompts vor jeder Generierung durch einen automatisierten Dienst zur Inhaltssicherheit geprüft. Blockierte oder nicht prüfbare Anfragen werden nicht generiert. Prüfprotokolle enthalten die Auftragskennung, die Entscheidung und, sofern gemeldet, eine Verletzungskategorie — weder den Prompt-Text noch deine Zugangsdaten.",
    faq3Q: "Was ist das AI Studio?",
    faq3A: "Das AI Studio ist unsere geplante Erstellungsfunktion: Du wirst ein Wallpaper in eigenen Worten beschreiben, Stil, Gerät und Seitenverhältnis wählen und optional ein Referenzbild hinzufügen können. Es ist derzeit nicht öffentlich verfügbar — siehe die nächste Frage.",
    faq4Q: "Was sind Credits?",
    faq4A: "Credits werden das geplante Prepaid-Guthaben von WallHaze für die KI-Wallpaper-Erstellung sein. Der Kauf von Credits ist noch nicht möglich — die gezeigten Preise sind Planpreise und können sich vor der Öffnung ändern.",
    faq5Q: "Warum ist die Generierung noch nicht geöffnet?",
    faq5A: "Die KI-Wallpaper-Erstellung wird zusammen mit unseren Zahlungs- und Inhaltssicherheits-Integrationen finalisiert. Sie öffnet sich, sobald alles verifiziert ist — beachte diese Seite und das Studio.",
    faq8A: "Nicht für die Galerie — das Ansehen und Herunterladen freigegebener Wallpaper erfordert kein Konto. Konten werden für die KI-Erstellung und das Credits-Guthaben erforderlich sein, sobald diese Funktionen offiziell starten.",
    helpStudioTitle: "AI Studio — Kommt bald",
    helpStudioBody:
      "Wir bereiten KI-Funktionen zur Wallpaper-Erstellung vor, darunter personalisierte statische Wallpaper und kurze Live-Wallpaper. Diese Erstellungsfunktionen sind derzeit nicht öffentlich verfügbar. In der Zwischenzeit kannst du die Wallpaper unserer Sammlung ansehen und herunterladen.",
    metaStudioTitle: "Studio — KI-Wallpaper-Erstellung (kommt bald)",
    metaStudioDescription:
      "Die KI-Wallpaper-Erstellung von WallHaze kommt bald. In der Zwischenzeit: kostenlose Wallpaper für Handy, Tablet und Desktop ansehen und herunterladen.",
    footerTagline: "Wallpaper für dein Gerät — entdecke die Sammlung, KI-Erstellung kommt bald.",
    pricingNote:
      "Der Kauf von AI-Credits ist noch nicht möglich. Die gezeigten Preise sind Planpreise und können sich vor der Verfügbarkeit von Käufen ändern.",
    liveDemoAiNote:
      "WallHaze-Plattformdemos — originale KI-generierte Live-Wallpaper, keine nutzergenerierten Ergebnisse · stumm · loopend · kostenlos",
    studioAiTitle: "KI-Erstellung — kommt bald",
    studioAiBody:
      "Wir bereiten unsere KI-Wallpaper-Erstellungsfunktionen vor. In der Zwischenzeit kannst du verfügbare Wallpaper ansehen und herunterladen. Die KI-Erstellung wird nach dem offiziellen Launch verfügbar sein.",
    studioComingTitle: "KI-Erstellung — Kommt bald",
    studioComingBody:
      "Wir bereiten unseren KI-Wallpaper-Erstellungsservice vor. In der Zwischenzeit kannst du verfügbare Wallpaper ansehen und herunterladen. Die KI-Erstellung wird nach dem offiziellen Launch verfügbar sein.",
    studioComingCta: "Erstellung derzeit nicht verfügbar",
  },
};

for (const loc of LOCALES) {
  const p = `messages/${loc}.json`;
  const j = JSON.parse(readFileSync(p, "utf8"));
  const c = C[loc];

  j.hero.subtitle = c.heroSubtitle;
  j.hero.footnote = c.heroFootnote;
  j.about.aiBody = c.aboutAiBody;
  j.terms.serviceBody = c.termsServiceBody;
  j.terms.aiBody = c.termsAiBody;
  j.terms.creditsBody = c.termsCreditsBody;
  j.privacy.plannedTitle = c.privacyPlannedTitle;
  j.privacy.plannedBody = c.privacyPlannedBody;
  j.privacy.screeningBody = c.privacyScreeningBody;
  j.faq.q3A = c.faq3A;
  j.faq.q4A = c.faq4A;
  j.faq.q5A = c.faq5A;
  j.faq.q8A = c.faq8A;
  j.help.studioTitle = c.helpStudioTitle;
  j.help.studioBody = c.helpStudioBody;
  j.meta.studioTitle = c.metaStudioTitle;
  j.meta.studioDescription = c.metaStudioDescription;
  j.footer.tagline = c.footerTagline;
  j.pricing.pricingNote = c.pricingNote;
  j.gallery.liveDemoAiNote = c.liveDemoAiNote;
  j.studio.aiGenerationTitle = c.studioAiTitle;
  j.studio.aiGenerationBody = c.studioAiBody;
  // Homepage sections (StudioIntro / HowItWorks / CtaSection).
  j.studioIntro.eyebrow = c.homeIntro.eyebrow;
  j.studioIntro.title = c.homeIntro.siTitle;
  j.studioIntro.body = c.homeIntro.siBody;
  j.studioIntro.cta = c.homeIntro.siCta;
  j.howItWorks.step2Title = c.homeIntro.step2Title;
  j.howItWorks.step2Body = c.homeIntro.step2Body;
  j.cta.button = c.homeIntro.ctaButton;
  j.studio.comingEyebrow = c.studioComingEyebrow;
  j.studio.comingTitle = c.studioComingTitle;
  j.studio.comingBody = c.studioComingBody;
  j.studio.comingCta = c.studioComingCta;

  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(loc, "updated");
}
