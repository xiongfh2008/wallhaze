// Waffo-review i18n additions for all seven locales. Idempotent: re-running
// converges to the same state. Run: node scripts/i18n-waffo.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];
const EMAIL = "hello@wallhaze.com";

const UPDATED = {
  en: "Last updated: October 30, 2026",
  zh: "最近更新：2026 年 10 月 30 日",
  ja: "最終更新：2026年10月30日",
  ko: "최종 업데이트: 2026년 10월 30일",
  es: "Última actualización: 30 de octubre de 2026",
  fr: "Dernière mise à jour : 30 octobre 2026",
  de: "Zuletzt aktualisiert: 30. Oktober 2026",
};

const NAV_PRICING = {
  en: "Pricing", zh: "价格", ja: "料金", ko: "가격",
  es: "Precios", fr: "Tarifs", de: "Preise",
};

const FOOTER = {
  pricing: {
    en: "Pricing", zh: "价格", ja: "料金", ko: "가격",
    es: "Precios", fr: "Tarifs", de: "Preise",
  },
  acceptableUse: {
    en: "Acceptable Use", zh: "使用规范", ja: "利用ポリシー", ko: "이용 정책",
    es: "Uso aceptable", fr: "Utilisation acceptable", de: "Akzeptable Nutzung",
  },
};

const META = {
  pricingTitle: {
    en: "Pricing & Credits", zh: "价格与积分", ja: "料金とクレジット",
    ko: "가격 및 크레딧", es: "Precios y créditos", fr: "Tarifs et crédits",
    de: "Preise & Credits",
  },
  pricingDescription: {
    en: "WallHaze pricing at a glance: one-time credit packages from $5 and per-generation credit costs for static and live wallpapers. No subscription, credits never expire.",
    zh: "WallHaze 价格一览：$5 起的一次性积分套餐，以及静态与动态壁纸的生成积分成本。无订阅，积分永不过期。",
    ja: "WallHaze の料金：$5 からの一回限りクレジットパッケージと、静止画・ライブ壁紙の生成ごとのクレジット消費。サブスクリプションなし、クレジットに有効期限はありません。",
    ko: "WallHaze 가격 한눈에 보기: $5부터 시작하는 일회성 크레딧 패키지와 정적·라이브 배경화면 생성당 크레딧 비용. 구독 없음, 크레딧 만료 없음.",
    es: "Precios de WallHaze de un vistazo: paquetes de créditos únicos desde $5 y coste en créditos por generación para fondos estáticos y dinámicos. Sin suscripción, los créditos no caducan.",
    fr: "Les tarifs WallHaze en un coup d’œil : des forfaits de crédits uniques à partir de 5 $ et le coût en crédits par génération pour les fonds statiques et animés. Sans abonnement, les crédits n’expirent jamais.",
    de: "WallHaze-Preise auf einen Blick: einmalige Credit-Pakete ab 5 $ und Credit-Kosten pro Generierung für statische und Live-Wallpaper. Kein Abo, Credits verfallen nie.",
  },
  aupTitle: {
    en: "Acceptable Use Policy", zh: "可接受使用政策", ja: "利用ポリシー",
    ko: "이용 정책", es: "Política de uso aceptable",
    fr: "Politique d’utilisation acceptable",
    de: "Richtlinie zur akzeptablen Nutzung",
  },
  aupDescription: {
    en: "What may be created and published through WallHaze: prohibited content categories, pre-generation screening, enforcement, and how to report or appeal.",
    zh: "通过 WallHaze 可以创建与发布的内容：禁止内容类别、生成前筛查、处置措施以及举报与申诉方式。",
    ja: "WallHaze で作成・公開できるコンテンツの基準：禁止カテゴリ、生成前審査、執行、報告と申し立ての方法。",
    ko: "WallHaze에서 만들고 게시할 수 있는 콘텐츠 기준: 금지 카테고리, 생성 전 심사, 집행, 신고 및 이의 신청 방법.",
    es: "Qué puede crearse y publicarse en WallHaze: categorías prohibidas, revisión previa a la generación, aplicación y cómo denunciar o apelar.",
    fr: "Ce qui peut être créé et publié via WallHaze : catégories interdites, examen avant génération, application, et comment signaler ou faire appel.",
    de: "Was über WallHaze erstellt und veröffentlicht werden darf: verbotene Inhaltskategorien, Prüfung vor der Generierung, Durchsetzung sowie Meldung und Einspruch.",
  },
};

const STUDIO = {
  modelsTitle: {
    en: "AI models & generation", zh: "AI 模型与生成", ja: "AIモデルと生成",
    ko: "AI 모델 및 생성", es: "Modelos de IA y generación",
    fr: "Modèles d’IA et génération", de: "KI-Modelle & Generierung",
  },
  modelsIntro: {
    en: "WallHaze generates wallpapers through third-party AI model services accessed via the fal.ai platform. The models currently in use:",
    zh: "WallHaze 通过 fal.ai 平台接入的第三方 AI 模型服务生成壁纸，当前使用的模型：",
    ja: "WallHaze は fal.ai プラットフォーム経由のサードパーティ AI モデルサービスで壁紙を生成します。現在使用中のモデル：",
    ko: "WallHaze는 fal.ai 플랫폼을 통해 서드파티 AI 모델 서비스로 배경화면을 생성합니다. 현재 사용 중인 모델:",
    es: "WallHaze genera fondos mediante servicios de modelos de IA de terceros accesidos vía fal.ai. Los modelos actualmente en uso:",
    fr: "WallHaze génère des fonds via des services de modèles d’IA tiers accessibles sur la plateforme fal.ai. Les modèles actuellement utilisés :",
    de: "WallHaze erzeugt Wallpaper über Drittanbieter-KI-Modelldienste auf der fal.ai-Plattform. Aktuell verwendete Modelle:",
  },
  modelNameImage: {
    en: "FLUX.2 [Klein] 4B", zh: "FLUX.2 [Klein] 4B", ja: "FLUX.2 [Klein] 4B",
    ko: "FLUX.2 [Klein] 4B", es: "FLUX.2 [Klein] 4B", fr: "FLUX.2 [Klein] 4B",
    de: "FLUX.2 [Klein] 4B",
  },
  modelUseImage: {
    en: "Text-to-image and image editing — static wallpapers and reference-image edits.",
    zh: "文生图与图片编辑——静态壁纸与参考图编辑。",
    ja: "テキストから画像の生成と画像編集 — 静止画壁紙と参照画像の編集。",
    ko: "텍스트→이미지 생성과 이미지 편집 — 정적 배경화면과 참조 이미지 편집.",
    es: "Texto a imagen y edición de imágenes — fondos estáticos y ediciones con imagen de referencia.",
    fr: "Texte vers image et édition d’images — fonds statiques et éditions avec image de référence.",
    de: "Text-zu-Bild und Bildbearbeitung — statische Wallpaper und Referenzbild-Bearbeitung.",
  },
  modelNameI2v: {
    en: "Wan 2.2 5B", zh: "Wan 2.2 5B", ja: "Wan 2.2 5B", ko: "Wan 2.2 5B",
    es: "Wan 2.2 5B", fr: "Wan 2.2 5B", de: "Wan 2.2 5B",
  },
  modelUseI2v: {
    en: "Image-to-video — turns an uploaded or generated image into a 5-second live wallpaper.",
    zh: "图生视频——将上传或生成的图片转为 5 秒动态壁纸。",
    ja: "画像から動画 — アップロードまたは生成した画像を5秒のライブ壁紙に変換。",
    ko: "이미지→비디오 — 업로드하거나 생성한 이미지를 5초 라이브 배경화면으로 변환.",
    es: "Imagen a vídeo — convierte una imagen subida o generada en un fondo dinámico de 5 segundos.",
    fr: "Image vers vidéo — transforme une image téléversée ou générée en fond animé de 5 secondes.",
    de: "Bild-zu-Video — verwandelt ein hochgeladenes oder generiertes Bild in ein 5-Sekunden-Live-Wallpaper.",
  },
  modelNameT2v: {
    en: "Kling V3 Standard", zh: "Kling V3 Standard", ja: "Kling V3 Standard",
    ko: "Kling V3 Standard", es: "Kling V3 Standard", fr: "Kling V3 Standard",
    de: "Kling V3 Standard",
  },
  modelUseT2v: {
    en: "Text-to-video — creates short live wallpapers from a text description (3–5 seconds).",
    zh: "文生视频——按文字描述生成 3–5 秒的动态壁纸。",
    ja: "テキストから動画 — 文章の説明から3〜5秒のライブ壁紙を生成。",
    ko: "텍스트→비디오 — 텍스트 설명으로 3–5초 라이브 배경화면 생성.",
    es: "Texto a vídeo — crea fondos dinámicos cortos a partir de una descripción (3–5 segundos).",
    fr: "Texte vers vidéo — crée de courts fonds animés à partir d’une description (3–5 secondes).",
    de: "Text-zu-Video — erzeugt kurze Live-Wallpaper aus einer Textbeschreibung (3–5 Sekunden).",
  },
  modelsNote: {
    en: "Prompts are screened automatically before a generation starts, and all use must follow the Acceptable Use Policy. Model availability and output can change as their providers update; WallHaze is not affiliated with the model publishers and accesses the models through fal.ai.",
    zh: "生成开始前会对提示词进行自动安全筛查，所有使用须遵守可接受使用政策。模型的可用性与输出可能随服务商更新而变化；WallHaze 与模型发布方无隶属关系，模型经 fal.ai 平台访问。",
    ja: "生成開始前にプロンプトの自動安全審査が行われ、すべての利用は利用ポリシーに従う必要があります。モデルの可用性と出力はプロバイダーの更新により変わる場合があります。WallHaze はモデルの公開元と提携しておらず、モデルは fal.ai プラットフォーム経由で利用します。",
    ko: "생성이 시작되기 전 프롬프트 자동 안전 심사가 이루어지며 모든 이용은 이용 정책을 따라야 합니다. 모델 가용성과 출력은 제공사 업데이트에 따라 달라질 수 있습니다. WallHaze는 모델 게시사와 제휴 관계가 없으며 모델은 fal.ai 플랫폼을 통해 이용합니다.",
    es: "Los prompts se examinan automáticamente antes de iniciar una generación y todo uso debe cumplir la Política de uso aceptable. La disponibilidad de modelos y sus resultados pueden cambiar con las actualizaciones de sus proveedores; WallHaze no está afiliado a los editores de los modelos y accede a ellos mediante fal.ai.",
    fr: "Les prompts sont examinés automatiquement avant le lancement d’une génération, et toute utilisation doit respecter la Politique d’utilisation acceptable. La disponibilité des modèles et leurs résultats peuvent évoluer avec les mises à jour des fournisseurs ; WallHaze n’est pas affilié aux éditeurs des modèles et y accède via fal.ai.",
    de: "Prompts werden automatisch geprüft, bevor eine Generierung startet, und jede Nutzung muss der Richtlinie zur akzeptablen Nutzung folgen. Modellverfügbarkeit und Ergebnisse können sich mit Anbieter-Updates ändern; WallHaze steht in keiner Verbindung zu den Modell-Herausgebern und nutzt die Modelle über fal.ai.",
  },
  viewPricing: {
    en: "View pricing", zh: "查看价格", ja: "料金を見る", ko: "가격 보기",
    es: "Ver precios", fr: "Voir les tarifs", de: "Preise ansehen",
  },
};

const ABOUT_AI = {
  aiTitle: {
    en: "AI technology", zh: "AI 技术", ja: "AIテクノロジー", ko: "AI 기술",
    es: "Tecnología de IA", fr: "Technologie d’IA", de: "KI-Technologie",
  },
  aiBody: {
    en: "WallHaze generates images and videos through third-party AI models accessed via the fal.ai platform: static wallpapers currently use FLUX.2 [Klein] 4B, and live wallpapers use Wan 2.2 5B (image-to-video) and Kling V3 Standard (text-to-video). Prompts are screened automatically before generation, and generated media in cloud storage is kept for 30 days.",
    zh: "WallHaze 通过 fal.ai 平台接入的第三方 AI 模型生成图片与视频：静态壁纸目前使用 FLUX.2 [Klein] 4B，动态壁纸使用 Wan 2.2 5B（图生视频）与 Kling V3 Standard（文生视频）。生成前会对提示词进行自动安全筛查，云端生成内容保留 30 天。",
    ja: "WallHaze は fal.ai プラットフォーム経由のサードパーティ AI モデルで画像と動画を生成します：静止画壁紙は現在 FLUX.2 [Klein] 4B、ライブ壁紙は Wan 2.2 5B（画像から動画）と Kling V3 Standard（テキストから動画）を使用します。生成前にプロンプトの自動審査が行われ、クラウド上の生成メディアは30日間保持されます。",
    ko: "WallHaze는 fal.ai 플랫폼을 통해 서드파티 AI 모델로 이미지와 비디오를 생성합니다: 정적 배경화면은 현재 FLUX.2 [Klein] 4B, 라이브 배경화면은 Wan 2.2 5B(이미지→비디오)와 Kling V3 Standard(텍스트→비디오)를 사용합니다. 생성 전 프롬프트 자동 심사가 이루어지며 클라우드 생성물은 30일간 보관됩니다.",
    es: "WallHaze genera imágenes y vídeos mediante modelos de IA de terceros accesidos vía fal.ai: los fondos estáticos usan actualmente FLUX.2 [Klein] 4B y los dinámicos usan Wan 2.2 5B (imagen a vídeo) y Kling V3 Standard (texto a vídeo). Los prompts se examinan automáticamente antes de generar y los medios generados en la nube se conservan 30 días.",
    fr: "WallHaze génère des images et des vidéos via des modèles d’IA tiers accessibles sur la plateforme fal.ai : les fonds statiques utilisent actuellement FLUX.2 [Klein] 4B, et les fonds animés utilisent Wan 2.2 5B (image vers vidéo) et Kling V3 Standard (texte vers vidéo). Les prompts sont examinés automatiquement avant génération, et les médias générés dans le stockage cloud sont conservés 30 jours.",
    de: "WallHaze erzeugt Bilder und Videos über Drittanbieter-KI-Modelle auf der fal.ai-Plattform: statische Wallpaper nutzen derzeit FLUX.2 [Klein] 4B, Live-Wallpaper nutzen Wan 2.2 5B (Bild-zu-Video) und Kling V3 Standard (Text-zu-Video). Prompts werden vor der Generierung automatisch geprüft, und in der Cloud gespeicherte Medien werden 30 Tage aufbewahrt.",
  },
};

// Eight additions to terms.prohibitedItems (six Waffo categories + two
// supplementary rules). The six existing items stay untouched.
const PROHIBITED_ADD = {
  en: [
    "generate pornographic or sexually explicit material (NSFW), or non-consensual intimate imagery;",
    "generate extreme violence, gore or torture, or content that glorifies serious physical harm;",
    "generate hate speech, discrimination or threats, or content inciting violence against protected groups;",
    "generate, request or distribute child sexual abuse material or any content that sexualizes minors — such attempts are recorded and reported to the relevant authorities;",
    "generate deepfakes or impersonations of real people — including AI-generated nudity of real people or fabricated statements attributed to them; this is prohibited even with the depicted person’s consent, and no such generation capability is offered;",
    "generate or distribute content that infringes copyright, trademark, likeness or other intellectual-property rights;",
    "use AI features to create unlawful content, or attempt to bypass, disable or manipulate safety screening, including the automated prompt review applied before generation;",
    "upload reference photos of real people without their authorization, or reference material you do not have the necessary rights or permission to use.",
  ],
  zh: [
    "生成色情或露骨性内容（NSFW），或非自愿私密影像；",
    "生成极端暴力、血腥或酷刑内容，或宣扬严重身体伤害的内容；",
    "生成仇恨言论、歧视或威胁，或煽动针对受保护群体暴力的内容；",
    "生成、请求或传播儿童性虐待材料或任何性化未成年人的内容——此类尝试会被记录并向有关部门报告；",
    "生成真人深度伪造或冒充内容——包括 AI 裸化真实人物或虚构其言论；即使当事人同意，该类别同样禁止，且平台不提供此类生成能力；",
    "生成或传播侵犯著作权、商标、肖像或其他知识产权的内容；",
    "利用 AI 功能生成任何违法内容，或试图绕过、禁用、操纵安全筛查（包括生成前的自动化提示词审查）；",
    "未经授权上传真实人物的参考照片，或上传你没有必要权利与许可的参考素材。",
  ],
  ja: [
    "ポルノや性的に露骨なコンテンツ（NSFW）、同意のない親密な映像を生成すること；",
    "過激な暴力、流血、拷問、または重篤な身体的危害を称賛するコンテンツを生成すること；",
    "ヘイトスピーチ、差別、脅迫、または保護された集団への暴力を扇動するコンテンツを生成すること；",
    "児童性的虐待資料や未成年を性的に描写するコンテンツを生成・要求・配布すること — この種の試みは記録され、関係当局に報告されます；",
    "実在の人物のディープフェイクやなりすましを生成すること — AIによるヌード化や発言の捏造を含みます。本人の同意があっても禁止で、この種の生成機能は提供していません；",
    "著作権、商標、肖像権その他の知的財産権を侵害するコンテンツを生成・配布すること；",
    "AI機能で違法なコンテンツを作成すること、または生成前の自動プロンプト審査を含む安全審査の回避・無効化・操作を試みること；",
    "本人の許可のない実在人物の参照写真、または必要な権利・許可のない参照素材をアップロードすること。",
  ],
  ko: [
    "포르노 또는 노골적 성적 콘텐츠(NSFW), 비동의 친밀 영상을 생성하는 행위;",
    "극단적 폭력, 유혈, 고문 또는 중상을 미화하는 콘텐츠를 생성하는 행위;",
    "혐오 발언, 차별, 위협 또는 보호 대상 집단에 대한 폭력을 선동하는 콘텐츠를 생성하는 행위;",
    "아동 성학대 자료 또는 미성년자를 성적으로 묘사하는 콘텐츠를 생성·요청·배포하는 행위 — 이러한 시도는 기록되어 관련 당국에 보고됩니다;",
    "실존 인물의 딥페이크 또는 사칭 콘텐츠를 생성하는 행위 — AI로 만든 누드나 허위 발언 꾸미기를 포함합니다. 당사자의 동의가 있어도 금지되며 이런 생성 기능은 제공하지 않습니다;",
    "저작권, 상표권, 초상권 또는 기타 지식재산권을 침해하는 콘텐츠를 생성·배포하는 행위;",
    "AI 기능으로 불법 콘텐츠를 만들거나, 생성 전 자동 프롬프트 심사를 포함한 안전 심사를 우회·비활성화·조작하려는 행위;",
    "승인 없는 실존 인물 참조 사진 또는 필요한 권리·허가가 없는 참조 소재를 업로드하는 행위.",
  ],
  es: [
    "generar material pornográfico o sexualmente explícito (NSFW), o imágenes íntimas sin consentimiento;",
    "generar violencia extrema, gore o tortura, o contenido que glorifique daños físicos graves;",
    "generar discurso de odio, discriminación o amenazas, o contenido que incite a la violencia contra grupos protegidos;",
    "generar, solicitar o distribuir material de abuso sexual infantil o cualquier contenido que sexualice a menores — esos intentos se registran y se reportan a las autoridades competentes;",
    "generar deepfakes o suplantaciones de personas reales — incluida la desnudez generada por IA de personas reales o declaraciones falsamente atribuidas; está prohibido incluso con el consentimiento de la persona retratada, y no se ofrece esa capacidad;",
    "generar o distribuir contenido que infrinja derechos de autor, marcas, derechos de imagen u otra propiedad intelectual;",
    "usar las funciones de IA para crear contenido ilegal, o intentar eludir, desactivar o manipular la revisión de seguridad, incluida la revisión automática del prompt previa a la generación;",
    "subir fotos de referencia de personas reales sin su autorización, o material de referencia sin los derechos y permisos necesarios.",
  ],
  fr: [
    "générer du matériel pornographique ou sexuellement explicite (NSFW), ou des images intimes sans consentement ;",
    "générer de la violence extrême, du gore ou de la torture, ou du contenu glorifiant des atteintes physiques graves ;",
    "générer des propos haineux, de la discrimination ou des menaces, ou du contenu incitant à la violence contre des groupes protégés ;",
    "générer, demander ou distribuer du matériel d’abus sexuel sur enfants ou tout contenu sexualisant des mineurs — ces tentatives sont enregistrées et signalées aux autorités compétentes ;",
    "générer des deepfakes ou des usurpations d’identité de personnes réelles — y compris des nus générés par IA de personnes réelles ou des propos attribués à faux ; interdit même avec le consentement de la personne représentée, et cette capacité n’est pas offerte ;",
    "générer ou distribuer du contenu portant atteinte aux droits d’auteur, marques, droits à l’image ou autre propriété intellectuelle ;",
    "utiliser les fonctions d’IA pour créer un contenu illégal, ou tenter de contourner, désactiver ou manipuler la revue de sécurité, y compris la vérification automatique du prompt avant génération ;",
    "téléverser des photos de référence de personnes réelles sans leur autorisation, ou du matériel de référence sans les droits et permissions nécessaires.",
  ],
  de: [
    "pornografisches oder sexuell explizites Material (NSFW) oder intime Bilder ohne Einwilligung zu erzeugen;",
    "extreme Gewalt, Gore oder Folter oder Inhalte, die schwere körperliche Schäden verherrlichen, zu erzeugen;",
    "Hassrede, Diskriminierung oder Drohungen oder Inhalte, die zu Gewalt gegen geschützte Gruppen anstiften, zu erzeugen;",
    "sexuelle Missbrauchsdarstellungen von Kindern oder Inhalte, die Minderjährige sexualisieren, zu erzeugen, anzufordern oder zu verbreiten — solche Versuche werden protokolliert und den zuständigen Behörden gemeldet;",
    "Deepfakes oder Identitätsmissbrauch echter Personen zu erzeugen — einschließlich KI-generierter Nacktheit echter Personen oder falsch zugeschriebener Aussagen; auch mit Einwilligung der abgebildeten Person verboten, und diese Generierungsfähigkeit wird nicht angeboten;",
    "Inhalte zu erzeugen oder zu verbreiten, die Urheberrechte, Marken, Persönlichkeitsrechte oder anderes geistiges Eigentum verletzen;",
    "KI-Funktionen zu nutzen, um rechtswidrige Inhalte zu erstellen, oder zu versuchen, Sicherheitsprüfungen — einschließlich der automatischen Prompt-Prüfung vor der Generierung — zu umgehen, zu deaktivieren oder zu manipulieren;",
    "Referenzfotos echter Personen ohne deren Genehmigung oder Referenzmaterial ohne die erforderlichen Rechte hochzuladen.",
  ],
};

const TERMS_AUP = {
  prohibitedAupBody: {
    en: "The prohibited categories, screening, enforcement and appeals are described in detail in the Acceptable Use Policy.",
    zh: "禁止类别、筛查机制、处置措施与申诉方式详见《可接受使用政策》。",
    ja: "禁止カテゴリ、審査、執行、申し立ての詳細は利用ポリシーをご覧ください。",
    ko: "금지 카테고리, 심사, 집행 및 이의 신청에 대한 자세한 내용은 이용 정책을 참고하세요.",
    es: "Las categorías prohibidas, la revisión, la aplicación y las apelaciones se describen en detalle en la Política de uso aceptable.",
    fr: "Les catégories interdites, l’examen, l’application et les appels sont décrits en détail dans la Politique d’utilisation acceptable.",
    de: "Die verbotenen Kategorien, die Prüfung, die Durchsetzung und Einsprüche sind in der Richtlinie zur akzeptablen Nutzung ausführlich beschrieben.",
  },
  prohibitedAupLink: {
    en: "Read the Acceptable Use Policy", zh: "阅读可接受使用政策",
    ja: "利用ポリシーを読む", ko: "이용 정책 읽기",
    es: "Leer la Política de uso aceptable",
    fr: "Lire la Politique d’utilisation acceptable",
    de: "Richtlinie zur akzeptablen Nutzung lesen",
  },
};

const AUP = {
  en: {
    eyebrow: "Acceptable Use",
    title: "Acceptable Use Policy",
    intro: "This policy defines what may be created and published through WallHaze. It applies to every prompt, reference image and generated work, and supplements the Terms of Service.",
    standardsTitle: "Prohibited content",
    standardsIntro: "The following categories are prohibited in prompts, reference images and generated output. Prompts are screened automatically before generation, and reported works are reviewed by a person.",
    categories: [
      ["Pornography / NSFW", "Generating or distributing pornographic material, sexually explicit content, or non-consensual intimate imagery is prohibited."],
      ["Violence / Gore", "Extreme violence, gore, torture, and content that glorifies serious physical harm are prohibited."],
      ["Hate Speech", "Hate speech, discrimination, threats, and content inciting violence against protected groups are prohibited."],
      ["Child-Unsafe Content / CSAM", "Child sexual abuse material, the sexualization of minors, and any content that harms or exploits children are prohibited. Attempts are recorded and reported to the relevant authorities."],
      ["Deepfakes / Impersonation", "Face-swaps of real people, AI-generated nudity of real people, and fabricated statements or actions attributed to real people are prohibited — even with the consent of the person depicted. WallHaze does not offer a capability for these generations."],
      ["Copyright / Trademark Infringement", "Content that infringes copyrights, trademarks, likeness rights or other intellectual property is prohibited."],
    ],
    additionalTitle: "Additional rules",
    additionalItems: [
      "Do not use AI features to create unlawful content of any kind.",
      "Do not attempt to bypass, disable or manipulate safety screening, including the automated prompt review applied before generation.",
      "Do not upload reference photos of real people without their authorization.",
      "You must hold the necessary rights and permission for every reference image you upload.",
    ],
    screeningTitle: "How content is reviewed",
    screeningBody: "Every prompt is screened by Waffo Prompt Sift (the automated content-safety service required by our review) before a generation is sent to the AI model, and a locally maintained prohibited-term list runs as a second layer. Requests that are blocked — or that cannot be screened — are never generated. Generated images and videos are then screened by an automated media moderation service (OpenAI Moderation API) before anything is stored or shown; video is checked from the first to the last frame with evenly spaced samples in between. Automated screening covers the categories that service supports — notably sexual content, graphic violence and self-harm imagery. Categories it cannot reliably judge — such as impersonation/deepfakes and copyright — are handled through human review of reports and appeals. Works reported by users are reviewed by a person before any action is taken, and published gallery content is re-scanned automatically.",
    enforcementTitle: "Enforcement",
    enforcementBody: "Content that violates this policy may be removed, and the generating account may be limited or suspended. Serious violations — especially anything involving minors — are reported to the relevant authorities. Decisions can be appealed by email.",
    reportTitle: "Reporting and appeals",
    reportBody: `To report a work or appeal a decision, email ${EMAIL} with the work’s link and a short description. Reports are reviewed by a person; we do not promise a specific response time.`,
    termsTitle: "Relationship to the Terms of Service",
    termsBody: "This policy supplements the Terms of Service; where wording differs, the stricter reading applies.",
    termsLink: "Read the Terms of Service",
  },
  zh: {
    eyebrow: "使用规范",
    title: "可接受使用政策",
    intro: "本政策定义通过 WallHaze 可以创建与发布的内容，适用于所有提示词、参考图与生成作品，并补充服务条款。",
    standardsTitle: "禁止内容",
    standardsIntro: "以下类别在提示词、参考图与生成输出中均被禁止。生成前执行自动筛查，被举报的作品由人工复核。",
    categories: [
      ["色情 / NSFW", "禁止生成或传播色情材料、露骨性内容或非自愿私密影像。"],
      ["暴力 / 血腥", "禁止极端暴力、血腥、酷刑以及宣扬严重身体伤害的内容。"],
      ["仇恨言论", "禁止仇恨言论、歧视、威胁以及煽动针对受保护群体暴力的内容。"],
      ["儿童不安全内容 / CSAM", "禁止儿童性虐待材料、未成年人性化内容以及任何伤害、剥削儿童的内容。相关尝试会被记录并向有关部门报告。"],
      ["深度伪造 / 冒充", "禁止真人换脸、AI 裸化真实人物以及虚构真实人物言行的内容——即使当事人同意，该类别同样禁止，且平台不提供此类生成能力。"],
      ["版权 / 商标侵权", "禁止侵犯版权、商标、肖像权或其他知识产权的内容。"],
    ],
    additionalTitle: "附加规则",
    additionalItems: [
      "不得利用 AI 功能生成任何违法内容。",
      "不得试图绕过、禁用、操纵安全筛查，包括生成前的自动化提示词审查。",
      "未经授权不得上传真实人物的参考照片。",
      "你上传的每张参考图都必须拥有必要的权利与许可。",
    ],
    screeningTitle: "内容审核方式",
    screeningBody: "生成发送至 AI 模型之前，每条提示词都会经过 Waffo Prompt Sift（审核要求接入的自动化内容安全服务）筛查，并叠加本地维护的禁止词库作为第二层。被拦截或无法筛查的请求不会被生成。生成的图片与视频在存储或展示之前，会经过自动化媒体审核服务（OpenAI Moderation API）检测，视频逐帧抽查。被举报的作品由人工复核后再作处理，已发布的图库内容会自动定期复查。",
    enforcementTitle: "处置措施",
    enforcementBody: "违反本政策的内容可能被删除，相关账户可能被限制或暂停；严重违规（尤其涉及未成年人）将向有关部门报告。可通过邮件申诉。",
    reportTitle: "举报与申诉",
    reportBody: `举报作品或申诉处理结果，请发送邮件至 ${EMAIL}，附作品链接与简要说明。举报由人工复核；我们不承诺具体答复时限。`,
    termsTitle: "与服务条款的关系",
    termsBody: "本政策补充服务条款；如表述不一致，以更严格的解释为准。",
    termsLink: "阅读服务条款",
  },
  ja: {
    eyebrow: "利用ポリシー",
    title: "利用ポリシー（Acceptable Use）",
    intro: "本ポリシーは WallHaze で作成・公開できるコンテンツの基準を定め、すべてのプロンプト・参照画像・生成物に適用され、利用規約を補足します。",
    standardsTitle: "禁止コンテンツ",
    standardsIntro: "以下のカテゴリはプロンプト・参照画像・生成出力のいずれでも禁止です。生成前に自動審査が行われ、報告された作品は人による確認を受けます。",
    categories: [
      ["ポルノ / NSFW", "ポルノ、性的に露骨なコンテンツ、同意のない親密な映像の生成・配布は禁止です。"],
      ["暴力 / ゴア", "過激な暴力、流血、拷問、重篤な身体的危害を称賛するコンテンツは禁止です。"],
      ["ヘイトスピーチ", "ヘイトスピーチ、差別、脅迫、保護された集団への暴力を扇動するコンテンツは禁止です。"],
      ["児童に有害なコンテンツ / CSAM", "児童性的虐待資料、未成年の性的描写、児童を害・搾取するコンテンツは禁止です。試みは記録され関係当局に報告されます。"],
      ["ディープフェイク / なりすまし", "実在の人物の顔入れ替え、AIによるヌード化、実在の人物の発言・行為の捏造は本人の同意があっても禁止で、この種の生成機能は提供していません。"],
      ["著作権 / 商標侵害", "著作権、商標、肖像権その他の知的財産を侵害するコンテンツは禁止です。"],
    ],
    additionalTitle: "追加ルール",
    additionalItems: [
      "AI機能で違法なコンテンツを作成しないこと。",
      "生成前の自動プロンプト審査を含む安全審査の回避・無効化・操作をしないこと。",
      "本人の許可のない実在人物の参照写真をアップロードしないこと。",
      "アップロードする参照素材すべてについて必要な権利・許可を保有すること。",
    ],
    screeningTitle: "審査の仕組み",
    screeningBody: "AIモデルへ送信される前に、すべてのプロンプトが Waffo Prompt Sift（審査で必須とされる自動コンテンツ安全サービス）で審査され、ローカルの禁止語リストが第2層として動作します。ブロックされたリクエストや審査できないリクエストは生成されません。生成された画像と動画は、保存・表示前に自動メディア審査サービス（OpenAI Moderation API）で検査され、動画はフレーム単位で確認します。報告された作品は人による確認後に対応され、公開済みギャラリーは自動で再審査されます。",
    enforcementTitle: "執行",
    enforcementBody: "ポリシー違反のコンテンツは削除、アカウントの制限・停止の対象となり、特に未成年に関わる重大な違反は関係当局に報告されます。決定にはメールで異議を申し立てられます。",
    reportTitle: "報告と申し立て",
    reportBody: `作品の報告や決定への申し立ては、作品リンクと概要を添えて ${EMAIL} までメールしてください。人による確認を行いますが、具体的な回答期限はお約束しません。`,
    termsTitle: "利用規約との関係",
    termsBody: "本ポリシーは利用規約を補足します。表現に差がある場合は厳しい解釈が優先されます。",
    termsLink: "利用規約を読む",
  },
  ko: {
    eyebrow: "이용 정책",
    title: "이용 정책 (Acceptable Use)",
    intro: "이 정책은 WallHaze에서 만들고 게시할 수 있는 콘텐츠 기준을 정하며, 모든 프롬프트·참조 이미지·생성물에 적용되고 서비스 약관을 보완합니다.",
    standardsTitle: "금지 콘텐츠",
    standardsIntro: "다음 카테고리는 프롬프트·참조 이미지·생성 결과에서 금지됩니다. 생성 전 자동 심사가 실행되고 신고된 작품은 사람이 확인합니다.",
    categories: [
      ["포르노 / NSFW", "포르노 자료, 노골적 성적 콘텐츠, 비동의 친밀 영상의 생성·배포 금지."],
      ["폭력 / 고어", "극단적 폭력, 유혈, 고문, 중상을 미화하는 콘텐츠 금지."],
      ["혐오 발언", "혐오 표현, 차별, 위협, 보호 대상 집단에 대한 폭력 선동 콘텐츠 금지."],
      ["아동 유해 콘텐츠 / CSAM", "아동 성학대 자료, 미성년자 성적 묘사, 아동을 해치거나 착취하는 콘텐츠 금지. 시도는 기록되어 관련 당국에 보고됩니다."],
      ["딥페이크 / 사칭", "실존 인물의 얼굴 합성, AI 누드, 실존 인물의 발언·행위 허위 꾸미기 금지 — 동의가 있어도 금지이며 이런 생성 기능은 제공하지 않습니다."],
      ["저작권 / 상표권 침해", "저작권, 상표권, 초상권 또는 기타 지식재산권을 침해하는 콘텐츠 금지."],
    ],
    additionalTitle: "추가 규칙",
    additionalItems: [
      "AI 기능으로 불법 콘텐츠를 만들지 마세요.",
      "생성 전 자동 프롬프트 심사를 포함한 안전 심사를 우회·비활성화·조작하지 마세요.",
      "승인 없는 실존 인물 참조 사진을 업로드하지 마세요.",
      "업로드하는 모든 참조 소재에 대해 필요한 권리와 허가를 보유해야 합니다.",
    ],
    screeningTitle: "콘텐츠 심사 방식",
    screeningBody: "AI 모델로 전송되기 전 모든 프롬프트가 Waffo Prompt Sift(심사에서 요구하는 자동 콘텐츠 안전 서비스)로 심사되고, 로컬 금지어 목록이 2차 계층으로 작동합니다. 차단되었거나 심사할 수 없는 요청은 생성되지 않습니다. 생성된 이미지와 영상은 저장·표시 전에 자동 미디어 심사 서비스(OpenAI Moderation API)로 검사하며 영상은 프레임 단위로 확인합니다. 신고된 작품은 사람이 확인한 뒤 조치되고, 공개된 갤러리는 자동으로 재심사됩니다.",
    enforcementTitle: "집행",
    enforcementBody: "정책 위반 콘텐츠는 삭제되고 계정이 제한·정지될 수 있으며, 특히 미성년자와 관련된 중대 위반은 관련 당국에 보고됩니다. 이메일로 이의를 제기할 수 있습니다.",
    reportTitle: "신고 및 이의 신청",
    reportBody: `작품 신고 또는 조치 이의 신청은 작품 링크와 간단한 설명을 포함해 ${EMAIL}로 보내 주세요. 사람이 확인하며 구체적 응답 시간을 보장하지는 않습니다.`,
    termsTitle: "서비스 약관과의 관계",
    termsBody: "이 정책은 서비스 약관을 보완하며, 표현이 다를 경우 더 엄격한 해석이 적용됩니다.",
    termsLink: "서비스 약관 읽기",
  },
  es: {
    eyebrow: "Uso aceptable",
    title: "Política de uso aceptable",
    intro: "Esta política define lo que puede crearse y publicarse en WallHaze. Aplica a todo prompt, imagen de referencia y obra generada, y complementa los Términos del servicio.",
    standardsTitle: "Contenido prohibido",
    standardsIntro: "Las siguientes categorías están prohibidas en prompts, imágenes de referencia y resultados. Los prompts se examinan automáticamente antes de generar y las obras denunciadas las revisa una persona.",
    categories: [
      ["Pornografía / NSFW", "Prohibido generar o distribuir material pornográfico, contenido sexualmente explícito o imágenes íntimas sin consentimiento."],
      ["Violencia / Gore", "Prohibida la violencia extrema, el gore, la tortura y el contenido que glorifique daños físicos graves."],
      ["Discurso de odio", "Prohibido el discurso de odio, la discriminación, las amenazas y la incitación a la violencia contra grupos protegidos."],
      ["Contenido inseguro para menores / CSAM", "Prohibido el material de abuso sexual infantil, la sexualización de menores y cualquier contenido que dañe o explote a niños. Los intentos se registran y se reportan a las autoridades competentes."],
      ["Deepfakes / Suplantación", "Prohibidos los cambios de rostro de personas reales, la desnudez generada por IA de personas reales y las declaraciones o acciones falsamente atribuidas a personas reales — incluso con el consentimiento de la persona retratada. WallHaze no ofrece esa capacidad."],
      ["Infracción de copyright / marcas", "Prohibido el contenido que infrinja derechos de autor, marcas, derechos de imagen u otra propiedad intelectual."],
    ],
    additionalTitle: "Reglas adicionales",
    additionalItems: [
      "No uses las funciones de IA para crear contenido ilegal de ningún tipo.",
      "No intentes eludir, desactivar o manipular la revisión de seguridad, incluida la revisión automática del prompt previa a la generación.",
      "No subas fotos de referencia de personas reales sin su autorización.",
      "Debes tener los derechos y permisos necesarios sobre cada imagen de referencia que subas.",
    ],
    screeningTitle: "Cómo se revisa el contenido",
    screeningBody: "Cada prompt se examina con Waffo Prompt Sift (el servicio automatizado de seguridad de contenido exigido por la revisión) antes de enviarse al modelo de IA, y una lista local de términos prohibidos actúa como segunda capa. Las solicitudes bloqueadas — o que no puedan revisarse — no se generan. Las imágenes y vídeos generados se examinan con un servicio automatizado de moderación de medios (OpenAI Moderation API) antes de almacenarse o mostrarse; el vídeo se comprueba fotograma a fotograma. Las obras denunciadas las revisa una persona antes de adoptar medidas, y el contenido publicado en la galería se vuelve a examinar automáticamente.",
    enforcementTitle: "Aplicación",
    enforcementBody: "El contenido que infrinja esta política puede eliminarse y la cuenta puede limitarse o suspenderse. Las infracciones graves — especialmente las que afecten a menores — se reportan a las autoridades competentes. Las decisiones pueden apelarse por correo electrónico.",
    reportTitle: "Denuncias y apelaciones",
    reportBody: `Para denunciar una obra o apelar una decisión, escribe a ${EMAIL} con el enlace de la obra y una breve descripción. Las denuncias las revisa una persona; no prometemos un tiempo de respuesta concreto.`,
    termsTitle: "Relación con los Términos del servicio",
    termsBody: "Esta política complementa los Términos del servicio; si la redacción difiere, prevalece la lectura más estricta.",
    termsLink: "Leer los Términos del servicio",
  },
  fr: {
    eyebrow: "Utilisation acceptable",
    title: "Politique d’utilisation acceptable",
    intro: "Cette politique définit ce qui peut être créé et publié via WallHaze. Elle s’applique à tout prompt, image de référence et œuvre générée, et complète les Conditions du service.",
    standardsTitle: "Contenu interdit",
    standardsIntro: "Les catégories suivantes sont interdites dans les prompts, les images de référence et les résultats générés. Les prompts sont examinés automatiquement avant génération, et les œuvres signalées sont vérifiées par une personne.",
    categories: [
      ["Pornographie / NSFW", "Générer ou distribuer du matériel pornographique, du contenu sexuellement explicite ou des images intimes sans consentement est interdit."],
      ["Violence / Gore", "La violence extrême, le gore, la torture et le contenu glorifiant des atteintes physiques graves sont interdits."],
      ["Discours haineux", "Les propos haineux, la discrimination, les menaces et l’incitation à la violence contre des groupes protégés sont interdits."],
      ["Contenu dangereux pour les enfants / CSAM", "Le matériel d’abus sexuel sur enfants, la sexualisation de mineurs et tout contenu nuisant à des enfants sont interdits. Les tentatives sont enregistrées et signalées aux autorités compétentes."],
      ["Deepfakes / Usurpation", "Les substitutions de visages de personnes réelles, les nus générés par IA de personnes réelles et les propos ou actes attribués à faux à des personnes réelles sont interdits — même avec le consentement de la personne représentée. WallHaze n’offre pas cette capacité."],
      ["Contrefaçon de droit d’auteur / de marque", "Le contenu portant atteinte aux droits d’auteur, marques, droits à l’image ou autre propriété intellectuelle est interdit."],
    ],
    additionalTitle: "Règles supplémentaires",
    additionalItems: [
      "Ne pas utiliser les fonctions d’IA pour créer un contenu illégal, quel qu’il soit.",
      "Ne pas tenter de contourner, désactiver ou manipuler la revue de sécurité, y compris la vérification automatique du prompt avant génération.",
      "Ne pas téléverser de photos de référence de personnes réelles sans leur autorisation.",
      "Vous devez détenir les droits et permissions nécessaires pour chaque image de référence téléversée.",
    ],
    screeningTitle: "Comment le contenu est examiné",
    screeningBody: "Chaque prompt est examiné par Waffo Prompt Sift (le service automatisé de sécurité du contenu exigé par la revue) avant d’être envoyé au modèle d’IA, et une liste locale de termes interdits constitue une seconde couche. Les requêtes bloquées — ou qui ne peuvent pas être examinées — ne sont jamais générées. Les images et vidéos générées sont ensuite examinées par un service automatisé de modération de médias (OpenAI Moderation API) avant tout stockage ou affichage ; la vidéo est vérifiée image par image. Les œuvres signalées sont vérifiées par une personne avant toute mesure, et le contenu publié dans la galerie est réexaminé automatiquement.",
    enforcementTitle: "Application",
    enforcementBody: "Le contenu violant cette politique peut être supprimé et le compte concerné peut être limité ou suspendu. Les violations graves — notamment celles impliquant des mineurs — sont signalées aux autorités compétentes. Les décisions peuvent faire l’objet d’un appel par courriel.",
    reportTitle: "Signalements et appels",
    reportBody: `Pour signaler une œuvre ou faire appel d’une décision, écrivez à ${EMAIL} avec le lien de l’œuvre et une brève description. Les signalements sont vérifiés par une personne ; nous ne promettons pas de délai de réponse précis.`,
    termsTitle: "Lien avec les Conditions du service",
    termsBody: "Cette politique complète les Conditions du service ; en cas de divergence, l’interprétation la plus stricte prévaut.",
    termsLink: "Lire les Conditions du service",
  },
  de: {
    eyebrow: "Akzeptable Nutzung",
    title: "Richtlinie zur akzeptablen Nutzung",
    intro: "Diese Richtlinie legt fest, was über WallHaze erstellt und veröffentlicht werden darf. Sie gilt für jeden Prompt, jedes Referenzbild und jedes generierte Werk und ergänzt die Nutzungsbedingungen.",
    standardsTitle: "Verbotene Inhalte",
    standardsIntro: "Die folgenden Kategorien sind in Prompts, Referenzbildern und generierten Ergebnissen verboten. Prompts werden vor der Generierung automatisch geprüft, und gemeldete Werke werden von einer Person überprüft.",
    categories: [
      ["Pornografie / NSFW", "Das Erzeugen oder Verbreiten von pornografischem Material, sexuell expliziten Inhalten oder intimen Bildern ohne Einwilligung ist verboten."],
      ["Gewalt / Gore", "Extreme Gewalt, Gore, Folter und Inhalte, die schwere körperliche Schäden verherrlichen, sind verboten."],
      ["Hassrede", "Hassrede, Diskriminierung, Drohungen und Inhalte, die zu Gewalt gegen geschützte Gruppen anstiften, sind verboten."],
      ["Für Kinder ungeeignete Inhalte / CSAM", "Sexuelle Missbrauchsdarstellungen von Kindern, die Sexualisierung Minderjähriger und alle Inhalte, die Kindern schaden oder sie ausbeuten, sind verboten. Versuche werden protokolliert und den zuständigen Behörden gemeldet."],
      ["Deepfakes / Identitätsmissbrauch", "Gesichtsersetzungen echter Personen, KI-generierte Nacktheit echter Personen und fälschlich zugeschriebene Aussagen oder Handlungen echter Personen sind verboten — auch mit Einwilligung der abgebildeten Person. WallHaze bietet diese Generierungsfähigkeit nicht an."],
      ["Urheberrecht / Markenverletzungen", "Inhalte, die Urheberrechte, Marken, Persönlichkeitsrechte oder anderes geistiges Eigentum verletzen, sind verboten."],
    ],
    additionalTitle: "Zusätzliche Regeln",
    additionalItems: [
      "KI-Funktionen nicht nutzen, um rechtswidrige Inhalte jeglicher Art zu erstellen.",
      "Nicht versuchen, Sicherheitsprüfungen — einschließlich der automatischen Prompt-Prüfung vor der Generierung — zu umgehen, zu deaktivieren oder zu manipulieren.",
      "Keine Referenzfotos echter Personen ohne deren Genehmigung hochladen.",
      "Für jedes hochgeladene Referenzbild müssen die erforderlichen Rechte und Genehmigungen vorliegen.",
    ],
    screeningTitle: "Wie Inhalte geprüft werden",
    screeningBody: "Jeder Prompt wird vor dem Senden an das KI-Modell durch Waffo Prompt Sift (der von der Prüfung geforderte automatisierte Dienst zur Inhaltssicherheit) geprüft, und eine lokal gepflegte Sperrliste läuft als zweite Ebene. Blockierte — oder nicht prüfbare — Anfragen werden nie generiert. Erzeugte Bilder und Videos werden vor dem Speichern oder Anzeigen durch einen automatisierten Medienmoderationsdienst (OpenAI Moderation API) geprüft; Video wird Frame für Frame kontrolliert. Gemeldete Werke werden von einer Person überprüft, bevor Maßnahmen ergriffen werden, und veröffentlichte Galerienhalte werden automatisch erneut geprüft.",
    enforcementTitle: "Durchsetzung",
    enforcementBody: "Inhalte, die gegen diese Richtlinie verstoßen, können entfernt werden; das Konto kann eingeschränkt oder gesperrt werden. Schwere Verstöße — insbesondere solche mit Bezug zu Minderjährigen — werden den zuständigen Behörden gemeldet. Entscheidungen können per E-Mail angefochten werden.",
    reportTitle: "Meldungen und Einsprüche",
    reportBody: `Um ein Werk zu melden oder eine Entscheidung anzufechten, schreibe an ${EMAIL} mit dem Link zum Werk und einer kurzen Beschreibung. Meldungen werden von einer Person überprüft; eine konkrete Antwortzeit versprechen wir nicht.`,
    termsTitle: "Verhältnis zu den Nutzungsbedingungen",
    termsBody: "Diese Richtlinie ergänzt die Nutzungsbedingungen; bei Abweichungen gilt die strengere Auslegung.",
    termsLink: "Nutzungsbedingungen lesen",
  },
};

const PRIVACY_ITEM_FAL = {
  en: "AI model providers — when you request a generation, your prompt, any reference image and your settings are sent through fal.ai to the selected model (currently FLUX.2 [Klein] 4B for images, Wan 2.2 5B for image-to-video and Kling V3 Standard for text-to-video); the generated media is returned to WallHaze.",
  zh: "AI 模型服务商——当你请求生成时，你的提示词、参考图与设置会经 fal.ai 发送至所选模型（当前为图片用的 FLUX.2 [Klein] 4B、图生视频用的 Wan 2.2 5B 与文生视频用的 Kling V3 Standard）；生成的媒体会返回 WallHaze。",
  ja: "AIモデルプロバイダー — 生成をリクエストすると、プロンプト・参照画像・設定が fal.ai を経由して選択されたモデル（現在は画像用 FLUX.2 [Klein] 4B、画像から動画用 Wan 2.2 5B、テキストから動画用 Kling V3 Standard）に送信され、生成されたメディアが WallHaze に返されます。",
  ko: "AI 모델 제공사 — 생성을 요청하면 프롬프트, 참조 이미지, 설정이 fal.ai를 통해 선택된 모델(현재 이미지용 FLUX.2 [Klein] 4B, 이미지→비디오용 Wan 2.2 5B, 텍스트→비디오용 Kling V3 Standard)로 전송되고 생성된 미디어가 WallHaze로 반환됩니다.",
  es: "Proveedores de modelos de IA — cuando solicitas una generación, tu prompt, la imagen de referencia y tu configuración se envían a través de fal.ai al modelo seleccionado (actualmente FLUX.2 [Klein] 4B para imágenes, Wan 2.2 5B para imagen a vídeo y Kling V3 Standard para texto a vídeo); los medios generados regresan a WallHaze.",
  fr: "Fournisseurs de modèles d’IA — lorsque vous demandez une génération, votre prompt, l’image de référence éventuelle et vos réglages sont envoyés via fal.ai au modèle sélectionné (actuellement FLUX.2 [Klein] 4B pour les images, Wan 2.2 5B pour l’image vers vidéo et Kling V3 Standard pour le texte vers vidéo) ; les médias générés reviennent à WallHaze.",
  de: "KI-Modellanbieter — wenn du eine Generierung anforderst, werden dein Prompt, ein Referenzbild und deine Einstellungen über fal.ai an das ausgewählte Modell gesendet (derzeit FLUX.2 [Klein] 4B für Bilder, Wan 2.2 5B für Bild-zu-Video und Kling V3 Standard für Text-zu-Video); die erzeugten Medien kehren zu WallHaze zurück.",
};

const PRIVACY_ITEM_SCREENING = {
  en: "Content-safety services — Waffo Prompt Sift reviews prompts before a generation starts, and the OpenAI Moderation API screens generated images and videos (frame sampling for video) before anything is stored or shown. Screening records keep the job id, the decision and — when reported — a violation category, not the prompt text.",
  zh: "内容安全服务——Waffo Prompt Sift 在生成开始前审查提示词；OpenAI Moderation API 在生成内容存储或展示前检测图片与视频（从首帧到末帧均匀采样）。自动审核覆盖该服务支持的类别——主要是色情内容、血腥暴力与自残画面；它无法可靠判定的类别——如冒充/深度伪造与版权问题——通过人工复核举报与申诉处理。筛查记录仅保存任务 ID、判定结果与（如服务商报告）违规类别，不保存提示词文本。",
  ja: "コンテンツ安全サービス — Waffo Prompt Sift が生成開始前にプロンプトを審査し、OpenAI Moderation API が保存・表示前に生成画像と動画（初帧から終帧まで均等にサンプリング）を検査します。自動審査が対応するのは、そのサービスが判定できるカテゴリ — 主に性的コンテンツ、暴力的な映像、自傷の描写 — です。なりすまし/ディープフェイクや著作権など、自動判定が難しいカテゴリは、報告と申し立ての人による確認で対応します。審査記録にはジョブID、判定、（報告された場合は）違反カテゴリが保存され、プロンプト本文は保存されません。",
  ko: "콘텐츠 안전 서비스 — Waffo Prompt Sift가 생성 시작 전 프롬프트를 심사하고, OpenAI Moderation API가 저장·표시 전에 생성 이미지와 영상(첫 프레임부터 마지막 프레임까지 균등 샘플링)을 검사합니다. 자동 심사는 해당 서비스가 판정할 수 있는 카테고리 — 주로 성적 콘텐츠, 폭력적 장면, 자해 묘사 — 를 다룹니다. 사칭/딥페이크나 저작권처럼 자동 판정이 어려운 카테고리는 신고와 이의 신청에 대한 사람의 확인으로 처리합니다. 심사 기록에는 작업 ID, 판정, (보고된 경우) 위반 카테고리가 저장되며 프롬프트 본문은 저장되지 않습니다.",
  es: "Servicios de seguridad de contenido — Waffo Prompt Sift examina los prompts antes de iniciar una generación, y la OpenAI Moderation API examina las imágenes y vídeos generados (muestreo uniforme desde el primer hasta el último fotograma) antes de almacenarlos o mostrarlos. La revisión automática cubre las categorías que ese servicio admite — en particular contenido sexual, violencia gráfica y autolesión. Las categorías que no puede juzgar con fiabilidad — como la suplantación/deepfakes y los derechos de autor — se tramitan mediante revisión humana de denuncias y apelaciones. Los registros guardan el id del trabajo, la decisión y — si se reporta — una categoría de infracción, no el texto del prompt.",
  fr: "Services de sécurité du contenu — Waffo Prompt Sift examine les prompts avant le lancement d’une génération, et l’OpenAI Moderation API examine les images et vidéos générées (échantillonnage régulier de la première à la dernière image) avant stockage ou affichage. La revue automatique couvre les catégories que ce service prend en charge — notamment le contenu sexuel, la violence graphique et l’automutilation. Les catégories qu’il ne peut pas juger de manière fiable — comme l’usurpation/deepfakes et le droit d’auteur — sont traitées par une revue humaine des signalements et des appels. Les enregistrements conservent l’identifiant du travail, la décision et — si signalée — une catégorie de violation, pas le texte du prompt.",
  de: "Inhaltssicherheitsdienste — Waffo Prompt Sift prüft Prompts, bevor eine Generierung startet, und die OpenAI Moderation API prüft erzeugte Bilder und Videos (gleichmäßige Abtastung vom ersten bis zum letzten Frame), bevor sie gespeichert oder angezeigt werden. Die automatisierte Prüfung deckt die Kategorien ab, die dieser Dienst unterstützt — insbesondere sexuelle Inhalte, grafische Gewalt und Selbsverletzung. Kategorien, die er nicht zuverlässig beurteilen kann — etwa Identitätsmissbrauch/Deepfakes und Urheberrecht — werden durch menschliche Prüfung von Meldungen und Einsprüchen behandelt. Prüfprotokolle enthalten die Auftrags-ID, die Entscheidung und — sofern gemeldet — eine Verletzungskategorie, nicht den Prompt-Text.",
};

const PRIVACY_SCREENING = {
  screeningTitle: {
    en: "Content screening", zh: "内容筛查", ja: "コンテンツ審査", ko: "콘텐츠 심사",
    es: "Revisión de contenido", fr: "Examen du contenu", de: "Inhaltsprüfung",
  },
  screeningBody: {
    en: "Before a generation is sent to the AI model, the prompt is screened by an automated content-safety service. Requests marked for review are held and re-checked for a short window; if no verdict arrives, the request is declined and the reserved Credits are released. Blocked or unscreenable requests are never generated, and generated media is screened again before it is stored. Screening logs are kept for abuse investigation and contain the job identifier, the decision and, where reported, a violation category — not the prompt text and not your credentials. Published gallery content is re-scanned automatically.",
    zh: "在生成请求发送至 AI 模型之前，提示词会经过自动化内容安全服务筛查。进入人工复核的请求会短暂保持并重新检查；未能出结果的请求会被拒绝并释放预留积分。被拦截或无法筛查的请求不会被生成，生成内容在存储前会再次审核。筛查日志用于滥用调查，仅包含任务标识、判定结果与（如报告）违规类别——不包含提示词文本，也不包含你的凭据。已发布的图库内容会自动定期复查。",
    ja: "生成をAIモデルへ送信する前に、プロンプトは自動コンテンツ安全サービスで審査されます。審査中とされたリクエストは短時間保持して再確認し、判定が出ない場合はリクエストを拒否して確保済みクレジットを解放します。ブロックされた、または審査できないリクエストは生成されず、生成メディアは保存前に再度審査されます。審査ログは悪用調査のために保持され、ジョブ識別子・判定・（報告された場合は）違反カテゴリを含みますが、プロンプト本文や認証情報は含みません。公開済みギャラリーは自動で再審査されます。",
    ko: "생성이 AI 모델로 전송되기 전 프롬프트가 자동 콘텐츠 안전 서비스로 심사됩니다. 심사 대상으로 표시된 요청은 짧은 시간 동안 보유 후 재확인하며, 판정이 나오지 않으면 요청이 거부되고 예약된 크레딧이 해제됩니다. 차단되었거나 심사할 수 없는 요청은 생성되지 않고, 생성된 미디어는 저장 전 다시 심사됩니다. 심사 로그는 악용 조사를 위해 보관되며 작업 식별자, 판정, (보고된 경우) 위반 카테고리를 포함합니다 — 프롬프트 본문이나 인증 정보는 포함하지 않습니다. 공개된 갤러리 콘텐츠는 자동으로 재심사됩니다.",
    es: "Antes de enviar una generación al modelo de IA, el prompt se examina con un servicio automatizado de seguridad de contenido. Las solicitudes marcadas para revisión se retienen y se vuelven a comprobar durante un breve periodo; si no llega un veredicto, la solicitud se rechaza y los créditos reservados se liberan. Las solicitudes bloqueadas o que no puedan revisarse nunca se generan, y los medios generados se examinan de nuevo antes de almacenarse. Los registros se conservan para investigar abusos y contienen el identificador del trabajo, la decisión y, si se reporta, una categoría de infracción — no el texto del prompt ni tus credenciales. El contenido publicado en la galería se vuelve a examinar automáticamente.",
    fr: "Avant l’envoi d’une génération au modèle d’IA, le prompt est examiné par un service automatisé de sécurité du contenu. Les requêtes marquées pour examen sont retenues et revérifiées pendant une courte période ; sans verdict, la requête est refusée et les crédits réservés sont libérés. Les requêtes bloquées — ou impossibles à examiner — ne sont jamais générées, et les médias générés sont de nouveau examinés avant stockage. Les journaux d’examen sont conservés pour l’investigation des abus et contiennent l’identifiant du travail, la décision et, le cas échéant, une catégorie de violation — ni le texte du prompt ni vos identifiants. Le contenu publié dans la galerie est réexaminé automatiquement.",
    de: "Bevor eine Generierung an das KI-Modell gesendet wird, wird der Prompt durch einen automatisierten Dienst zur Inhaltssicherheit geprüft. Zur Prüfung markierte Anfragen werden kurzzeitig gehalten und erneut geprüft; ohne Entscheidung wird die Anfrage abgelehnt und die reservierten Credits werden freigegeben. Blockierte oder nicht prüfbare Anfragen werden nie generiert, und erzeugte Medien werden vor dem Speichern erneut geprüft. Prüfprotokolle werden zur Missbrauchsuntersuchung aufbewahrt und enthalten die Auftragskennung, die Entscheidung und, sofern gemeldet, eine Verletzungskategorie — weder den Prompt-Text noch deine Zugangsdaten. Veröffentlichte Galerienhalte werden automatisch erneut geprüft.",
  },
};

// Moderation-chain job failures: honest, actionable copy. Blocked/pending
// never call the AI; output rejections mean the AI ran but nothing was
// published. All of them release the reserved Credits (no double charge).
const MODERATION_ERRORS = {
  en: {
    blocked: "This request doesn't meet our content guidelines, so it wasn't generated. No Credits were charged.",
    pending: "Content review couldn't complete for this request, so it wasn't generated. No Credits were charged — please try again later.",
    unavailable: "Content screening is temporarily unavailable, so this request can't be processed. No Credits were charged — please try again later.",
    outputBlocked: "The generated result didn't pass content review and wasn't published. No Credits were charged.",
    outputUnavailable: "Content review is temporarily unavailable, so the generated result can't be published. No Credits were charged — please try again later.",
  },
  zh: {
    blocked: "该请求不符合内容规范，未进行生成。未扣除积分。",
    pending: "该请求的内容审核未能按时完成，未进行生成。未扣除积分——请稍后重试。",
    unavailable: "内容筛查服务暂时不可用，无法处理该请求。未扣除积分——请稍后重试。",
    outputBlocked: "生成结果未通过内容审核，未予发布。未扣除积分。",
    outputUnavailable: "内容审核服务暂时不可用，生成结果无法发布。未扣除积分——请稍后重试。",
  },
  ja: {
    blocked: "このリクエストはコンテンツガイドラインに合わないため生成されませんでした。クレジットは請求されていません。",
    pending: "コンテンツ審査が時間内に完了しなかったため、生成されませんでした。クレジットは請求されていません — 後ほどお試しください。",
    unavailable: "コンテンツ審査サービスが一時的に利用できないため、このリクエストは処理できません。クレジットは請求されていません — 後ほどお試しください。",
    outputBlocked: "生成結果がコンテンツ審査を通過せず、公開されませんでした。クレジットは請求されていません。",
    outputUnavailable: "コンテンツ審査が一時的に利用できないため、生成結果を公開できません。クレジットは請求されていません — 後ほどお試しください。",
  },
  ko: {
    blocked: "이 요청은 콘텐츠 가이드라인에 맞지 않아 생성되지 않았습니다. 크레딧은 청구되지 않았습니다.",
    pending: "콘텐츠 심사가 제시간에 완료되지 않아 생성되지 않았습니다. 크레딧은 청구되지 않았습니다 — 잠시 후 다시 시도해 주세요.",
    unavailable: "콘텐츠 심사 서비스가 일시적으로 사용 불가하여 요청을 처리할 수 없습니다. 크레딧은 청구되지 않았습니다 — 잠시 후 다시 시도해 주세요.",
    outputBlocked: "생성 결과가 콘텐츠 심사를 통과하지 못해 게시되지 않았습니다. 크레딧은 청구되지 않았습니다.",
    outputUnavailable: "콘텐츠 심사가 일시적으로 사용 불가하여 생성 결과를 게시할 수 없습니다. 크레딧은 청구되지 않았습니다 — 잠시 후 다시 시도해 주세요.",
  },
  es: {
    blocked: "Esta solicitud no cumple nuestras normas de contenido, así que no se generó. No se cobraron créditos.",
    pending: "La revisión de contenido no pudo completarse a tiempo, así que no se generó. No se cobraron créditos — inténtalo de nuevo más tarde.",
    unavailable: "El filtrado de contenido no está disponible temporalmente, así que no se puede procesar la solicitud. No se cobraron créditos — inténtalo de nuevo más tarde.",
    outputBlocked: "El resultado generado no pasó la revisión de contenido y no se publicó. No se cobraron créditos.",
    outputUnavailable: "La revisión de contenido no está disponible temporalmente, así que el resultado no puede publicarse. No se cobraron créditos — inténtalo de nuevo más tarde.",
  },
  fr: {
    blocked: "Cette demande ne respecte pas nos règles de contenu : elle n'a pas été générée. Aucun crédit n'a été débité.",
    pending: "La revue de contenu n'a pas pu aboutir à temps : rien n'a été généré. Aucun crédit n'a été débité — réessayez plus tard.",
    unavailable: "Le filtrage de contenu est temporairement indisponible : la demande ne peut pas être traitée. Aucun crédit n'a été débité — réessayez plus tard.",
    outputBlocked: "Le résultat généré n'a pas passé la revue de contenu et n'a pas été publié. Aucun crédit n'a été débité.",
    outputUnavailable: "La revue de contenu est temporairement indisponible : le résultat ne peut pas être publié. Aucun crédit n'a été débité — réessayez plus tard.",
  },
  de: {
    blocked: "Diese Anfrage entspricht nicht unseren Inhaltsrichtlinien und wurde nicht generiert. Es wurden keine Credits berechnet.",
    pending: "Die Inhaltsprüfung konnte nicht rechtzeitig abgeschlossen werden, daher wurde nichts generiert. Es wurden keine Credits berechnet — bitte später erneut versuchen.",
    unavailable: "Die Inhaltssicherheitsprüfung ist vorübergehend nicht verfügbar, daher kann die Anfrage nicht verarbeitet werden. Es wurden keine Credits berechnet — bitte später erneut versuchen.",
    outputBlocked: "Das generierte Ergebnis hat die Inhaltsprüfung nicht bestanden und wurde nicht veröffentlicht. Es wurden keine Credits berechnet.",
    outputUnavailable: "Die Inhaltsprüfung ist vorübergehend nicht verfügbar, daher kann das Ergebnis nicht veröffentlicht werden. Es wurden keine Credits berechnet — bitte später erneut versuchen.",
  },
};

// Real configuration (apps/api/src/business/pricing.ts, video-pricing.ts,
// migrations/002_packages.sql): starter 100/$5, creator 500/$20,
// studio 2000/$69 one-time USD; image 10; I2V 5s=40; T2V 3/4/5s=40/50/60.
const PRICING = {
  en: {
    eyebrow: "Pricing",
    title: "Pricing & Credits",
    intro: "WallHaze uses one-time credit packages — no subscription. Credits pay for each generation and never expire.",
    packagesTitle: "Credit packages",
    packagesIntro: "All packages are one-time purchases in USD.",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "≈ 10 static wallpapers" },
      { name: "Creator", credits: "500", price: "$20", note: "≈ 50 static wallpapers, or a mix of stills and live wallpapers" },
      { name: "Studio", credits: "2,000", price: "$69", note: "Best for live wallpapers and larger batches" },
    ],
    packagesNote: "Credits never expire and stay in your wallet until spent.",
    genTitle: "Generation costs",
    genIntro: "What each generation costs in Credits (reserved when the job starts):",
    genItems: [
      { name: "Static wallpaper — text-to-image or reference-image edit", cost: "10 Credits" },
      { name: "Live wallpaper — image-to-video, 5 seconds", cost: "40 Credits" },
      { name: "Live wallpaper — text-to-video, 3 / 4 / 5 seconds", cost: "40 / 50 / 60 Credits" },
    ],
    genNote: "Credits are held while a job runs and are released automatically if the job fails — a failed generation never charges you.",
    billingTitle: "Billing",
    billingItems: [
      "One-time purchases in USD — no subscription and no recurring charges.",
      "Credits never expire.",
      "Reserved credits are released automatically when a generation fails.",
      "Packages are processed by our payment provider once checkout is open.",
    ],
    checkoutTitle: "Checkout is opening soon",
    checkoutBody: "Purchases are processed by our payment provider and the checkout channel is in its final verification. Buy buttons stay disabled until the channel opens — generating with existing credits works normally today.",
    checkoutComing: "Checkout opening soon",
    faqTitle: "Pricing FAQ",
    faq: [
      { q: "Are credits a subscription?", a: "No. Credit packages are one-time purchases in USD and credits never expire." },
      { q: "What happens if a generation fails?", a: "The credits reserved for the job are released automatically and your balance is restored — failed generations cost nothing." },
      { q: "How much does a live wallpaper cost?", a: "Image-to-video (5 s) costs 40 Credits. Text-to-video costs 40 Credits for 3 seconds, 50 for 4 seconds and 60 for 5 seconds. A static wallpaper is 10 Credits." },
      { q: "When can I buy credits?", a: "Checkout is in its final verification with our payment provider. Buy buttons stay disabled until the channel opens; you can generate with existing credits in the meantime." },
      { q: "Do prices change?", a: "The costs on this page reflect the current server-side configuration. The Studio always shows the live cost of a job before you start it." },
    ],
  },
  zh: {
    eyebrow: "价格",
    title: "价格与积分",
    intro: "WallHaze 采用一次性积分套餐——无订阅。积分用于支付每次生成，永不过期。",
    packagesTitle: "积分套餐",
    packagesIntro: "所有套餐均为一次性美元购买。",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "≈ 10 张静态壁纸" },
      { name: "Creator", credits: "500", price: "$20", note: "≈ 50 张静态壁纸，或静态与动态壁纸组合" },
      { name: "Studio", credits: "2,000", price: "$69", note: "适合动态壁纸与大批量生成" },
    ],
    packagesNote: "积分永不过期，余额保存在你的钱包中直至用完。",
    genTitle: "生成成本",
    genIntro: "每次生成消耗的积分（任务开始时预留）：",
    genItems: [
      { name: "静态壁纸——文生图或参考图编辑", cost: "10 积分" },
      { name: "动态壁纸——图生视频，5 秒", cost: "40 积分" },
      { name: "动态壁纸——文生视频，3 / 4 / 5 秒", cost: "40 / 50 / 60 积分" },
    ],
    genNote: "积分在任务运行期间被锁定，任务失败会自动释放——失败的生成不会扣费。",
    billingTitle: "计费说明",
    billingItems: [
      "一次性美元购买——无订阅，无周期扣费。",
      "积分永不过期。",
      "生成失败时，预留积分会自动释放。",
      "结账通道开放后，套餐购买由支付服务商处理。",
    ],
    checkoutTitle: "结账通道即将开放",
    checkoutBody: "购买由支付服务商处理，结账通道正在最终确认。通道开放前购买按钮保持禁用——使用现有积分进行生成不受影响。",
    checkoutComing: "结账即将开放",
    faqTitle: "价格常见问题",
    faq: [
      { q: "积分是订阅吗？", a: "不是。积分套餐为一次性美元购买，积分永不过期。" },
      { q: "生成失败怎么办？", a: "为该任务预留的积分会自动释放，余额恢复——失败的生成不产生任何费用。" },
      { q: "动态壁纸多少钱？", a: "图生视频（5 秒）40 积分；文生视频 3 秒 40 积分、4 秒 50 积分、5 秒 60 积分；静态壁纸 10 积分。" },
      { q: "什么时候可以购买积分？", a: "结账通道正在与支付服务商进行最终确认。通道开放前购买按钮保持禁用；期间你仍可使用现有积分生成。" },
      { q: "价格会变化吗？", a: "本页成本反映当前的服务端配置。开始任务前，Studio 始终显示实时成本。" },
    ],
  },
  ja: {
    eyebrow: "料金",
    title: "料金とクレジット",
    intro: "WallHaze は一回限りのクレジットパッケージ方式です — サブスクリプションはありません。クレジットは各生成の支払いに使われ、有効期限はありません。",
    packagesTitle: "クレジットパッケージ",
    packagesIntro: "すべてのパッケージは米ドルの一括購入です。",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "静止画壁紙 約10枚" },
      { name: "Creator", credits: "500", price: "$20", note: "静止画壁紙 約50枚、または静止画とライブ壁紙の組み合わせ" },
      { name: "Studio", credits: "2,000", price: "$69", note: "ライブ壁紙やまとまった生成に最適" },
    ],
    packagesNote: "クレジットに有効期限はなく、使うまでウォレットに残ります。",
    genTitle: "生成コスト",
    genIntro: "各生成にかかるクレジット（ジョブ開始時に確保）：",
    genItems: [
      { name: "静止画壁紙 — テキストから画像・参照画像の編集", cost: "10クレジット" },
      { name: "ライブ壁紙 — 画像から動画、5秒", cost: "40クレジット" },
      { name: "ライブ壁紙 — テキストから動画、3 / 4 / 5秒", cost: "40 / 50 / 60クレジット" },
    ],
    genNote: "クレジットはジョブの実行中に確保され、ジョブが失敗すると自動で解放されます — 失敗した生成は請求されません。",
    billingTitle: "請求について",
    billingItems: [
      "米ドルの一括購入 — サブスクリプションも定期課金もありません。",
      "クレジットに有効期限はありません。",
      "生成が失敗すると、確保されていたクレジットは自動で解放されます。",
      "チェックアウト開放後、パッケージ購入は決済プロバイダーが処理します。",
    ],
    checkoutTitle: "チェックアウトは近日開放",
    checkoutBody: "購入は決済プロバイダーが処理し、チェックアウト経路は最終確認中です。開放まで購入ボタンは無効のままです — 既存クレジットでの生成は通常どおり利用できます。",
    checkoutComing: "チェックアウト準備中",
    faqTitle: "料金FAQ",
    faq: [
      { q: "クレジットはサブスクリプションですか？", a: "いいえ。クレジットパッケージは米ドルの一括購入で、有効期限はありません。" },
      { q: "生成に失敗したら？", a: "ジョブ用に確保されたクレジットは自動で解放され、残高が復元されます — 失敗した生成に費用はかかりません。" },
      { q: "ライブ壁紙の料金は？", a: "画像から動画（5秒）は40クレジット。テキストから動画は3秒40・4秒50・5秒60クレジット。静止画壁紙は10クレジットです。" },
      { q: "いつクレジットを購入できますか？", a: "チェックアウトは決済プロバイダーとの最終確認中です。開放まで購入ボタンは無効ですが、その間も既存クレジットで生成できます。" },
      { q: "料金は変わりますか？", a: "このページのコストは現在のサーバー側設定を反映しています。ジョブ開始前に、Studio には常に実際のコストが表示されます。" },
    ],
  },
  ko: {
    eyebrow: "가격",
    title: "가격 및 크레딧",
    intro: "WallHaze는 일회성 크레딧 패키지 방식입니다 — 구독이 없습니다. 크레딧은 각 생성에 사용되며 만료되지 않습니다.",
    packagesTitle: "크레딧 패키지",
    packagesIntro: "모든 패키지는 USD 일회성 구매입니다.",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "정적 배경화면 약 10장" },
      { name: "Creator", credits: "500", price: "$20", note: "정적 배경화면 약 50장, 또는 정적·라이브 조합" },
      { name: "Studio", credits: "2,000", price: "$69", note: "라이브 배경화면과 대량 생성에 적합" },
    ],
    packagesNote: "크레딧은 만료되지 않으며 사용할 때까지 지갑에 남아 있습니다.",
    genTitle: "생성 비용",
    genIntro: "생성당 크레딧 소요량(작업 시작 시 예약):",
    genItems: [
      { name: "정적 배경화면 — 텍스트→이미지 또는 참조 이미지 편집", cost: "10 크레딧" },
      { name: "라이브 배경화면 — 이미지→비디오, 5초", cost: "40 크레딧" },
      { name: "라이브 배경화면 — 텍스트→비디오, 3 / 4 / 5초", cost: "40 / 50 / 60 크레딧" },
    ],
    genNote: "크레딧은 작업이 실행되는 동안 보유되며 작업이 실패하면 자동으로 해제됩니다 — 실패한 생성은 청구되지 않습니다.",
    billingTitle: "결제 안내",
    billingItems: [
      "USD 일회성 구매 — 구독 및 정기 결제 없음.",
      "크레딧은 만료되지 않습니다.",
      "생성이 실패하면 예약된 크레딧이 자동으로 해제됩니다.",
      "체크아웃이 열리면 패키지 구매는 결제 대행사가 처리합니다.",
    ],
    checkoutTitle: "결제 채널 준비 중",
    checkoutBody: "구매는 결제 대행사가 처리하며 결제 채널은 최종 확인 중입니다. 채널이 열릴 때까지 구매 버튼은 비활성 상태입니다 — 기존 크레딧으로 생성하는 것은 정상적으로 이용할 수 있습니다.",
    checkoutComing: "결제 곧 개시",
    faqTitle: "가격 FAQ",
    faq: [
      { q: "크레딧은 구독인가요?", a: "아니요. 크레딧 패키지는 USD 일회성 구매이며 크레딧은 만료되지 않습니다." },
      { q: "생성이 실패하면 어떻게 되나요?", a: "작업에 예약된 크레딧이 자동으로 해제되고 잔액이 복구됩니다 — 실패한 생성에는 비용이 들지 않습니다." },
      { q: "라이브 배경화면 가격은?", a: "이미지→비디오(5초)는 40 크레딧입니다. 텍스트→비디오는 3초 40, 4초 50, 5초 60 크레딧입니다. 정적 배경화면은 10 크레딧입니다." },
      { q: "언제 크레딧을 구매할 수 있나요?", a: "결제 채널은 결제 대행사와 최종 확인 중입니다. 채널이 열릴 때까지 구매 버튼은 비활성이며, 그동안 기존 크레딧으로 생성할 수 있습니다." },
      { q: "가격이 바뀌나요?", a: "이 페이지의 비용은 현재 서버 측 설정을 반영합니다. 작업 시작 전에 Studio에 항상 실제 비용이 표시됩니다." },
    ],
  },
  es: {
    eyebrow: "Precios",
    title: "Precios y créditos",
    intro: "WallHaze usa paquetes de créditos únicos — sin suscripción. Los créditos pagan cada generación y nunca caducan.",
    packagesTitle: "Paquetes de créditos",
    packagesIntro: "Todos los paquetes son compras únicas en USD.",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "≈ 10 fondos estáticos" },
      { name: "Creator", credits: "500", price: "$20", note: "≈ 50 fondos estáticos, o una mezcla de estáticos y dinámicos" },
      { name: "Studio", credits: "2,000", price: "$69", note: "Ideal para fondos dinámicos y lotes grandes" },
    ],
    packagesNote: "Los créditos nunca caducan y permanecen en tu cartera hasta gastarlos.",
    genTitle: "Coste por generación",
    genIntro: "Lo que cuesta cada generación en créditos (se reservan al iniciar el trabajo):",
    genItems: [
      { name: "Fondo estático — texto a imagen o edición con referencia", cost: "10 créditos" },
      { name: "Fondo dinámico — imagen a vídeo, 5 segundos", cost: "40 créditos" },
      { name: "Fondo dinámico — texto a vídeo, 3 / 4 / 5 segundos", cost: "40 / 50 / 60 créditos" },
    ],
    genNote: "Los créditos se retienen mientras el trabajo se ejecuta y se liberan automáticamente si falla — una generación fallida nunca te cobra.",
    billingTitle: "Facturación",
    billingItems: [
      "Compras únicas en USD — sin suscripción ni cargos recurrentes.",
      "Los créditos nunca caducan.",
      "Los créditos reservados se liberan automáticamente cuando una generación falla.",
      "Los paquetes los procesa nuestro proveedor de pagos cuando el checkout esté abierto.",
    ],
    checkoutTitle: "El checkout abre pronto",
    checkoutBody: "Las compras las procesa nuestro proveedor de pagos y el canal de checkout está en su verificación final. Los botones de compra permanecen deshabilitados hasta que el canal abra — generar con los créditos existentes funciona con normalidad hoy.",
    checkoutComing: "Checkout próximamente",
    faqTitle: "Preguntas frecuentes sobre precios",
    faq: [
      { q: "¿Los créditos son una suscripción?", a: "No. Los paquetes de créditos son compras únicas en USD y los créditos nunca caducan." },
      { q: "¿Qué pasa si falla una generación?", a: "Los créditos reservados para el trabajo se liberan automáticamente y tu saldo se restaura — las generaciones fallidas no cuestan nada." },
      { q: "¿Cuánto cuesta un fondo dinámico?", a: "Imagen a vídeo (5 s) cuesta 40 créditos. Texto a vídeo cuesta 40 créditos por 3 segundos, 50 por 4 segundos y 60 por 5 segundos. Un fondo estático son 10 créditos." },
      { q: "¿Cuándo puedo comprar créditos?", a: "El checkout está en su verificación final con nuestro proveedor de pagos. Los botones de compra permanecen deshabilitados hasta que el canal abra; mientras tanto puedes generar con los créditos existentes." },
      { q: "¿Cambian los precios?", a: "Los costes de esta página reflejan la configuración actual del servidor. El Studio siempre muestra el coste real de un trabajo antes de iniciarlo." },
    ],
  },
  fr: {
    eyebrow: "Tarifs",
    title: "Tarifs et crédits",
    intro: "WallHaze utilise des forfaits de crédits uniques — sans abonnement. Les crédits paient chaque génération et n’expirent jamais.",
    packagesTitle: "Forfaits de crédits",
    packagesIntro: "Tous les forfaits sont des achats uniques en USD.",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "≈ 10 fonds statiques" },
      { name: "Creator", credits: "500", price: "$20", note: "≈ 50 fonds statiques, ou un mélange de statiques et d’animés" },
      { name: "Studio", credits: "2,000", price: "$69", note: "Idéal pour les fonds animés et les lots importants" },
    ],
    packagesNote: "Les crédits n’expirent jamais et restent dans votre portefeuille jusqu’à utilisation.",
    genTitle: "Coût par génération",
    genIntro: "Ce que coûte chaque génération en crédits (réservés au lancement du travail) :",
    genItems: [
      { name: "Fond statique — texte vers image ou édition avec référence", cost: "10 crédits" },
      { name: "Fond animé — image vers vidéo, 5 secondes", cost: "40 crédits" },
      { name: "Fond animé — texte vers vidéo, 3 / 4 / 5 secondes", cost: "40 / 50 / 60 crédits" },
    ],
    genNote: "Les crédits sont retenus pendant l’exécution du travail et libérés automatiquement en cas d’échec — une génération échouée ne vous est jamais facturée.",
    billingTitle: "Facturation",
    billingItems: [
      "Achats uniques en USD — sans abonnement ni frais récurrents.",
      "Les crédits n’expirent jamais.",
      "Les crédits réservés sont libérés automatiquement en cas d’échec d’une génération.",
      "Les forfaits sont traités par notre prestataire de paiement une fois le checkout ouvert.",
    ],
    checkoutTitle: "Le checkout ouvre bientôt",
    checkoutBody: "Les achats sont traités par notre prestataire de paiement et le canal de checkout est en vérification finale. Les boutons d’achat restent désactivés jusqu’à l’ouverture du canal — générer avec les crédits existants fonctionne normalement aujourd’hui.",
    checkoutComing: "Checkout bientôt disponible",
    faqTitle: "FAQ tarifs",
    faq: [
      { q: "Les crédits sont-ils un abonnement ?", a: "Non. Les forfaits de crédits sont des achats uniques en USD et les crédits n’expirent jamais." },
      { q: "Que se passe-t-il si une génération échoue ?", a: "Les crédits réservés au travail sont libérés automatiquement et votre solde est restauré — les générations échouées ne coûtent rien." },
      { q: "Combien coûte un fond animé ?", a: "Image vers vidéo (5 s) coûte 40 crédits. Texte vers vidéo coûte 40 crédits pour 3 secondes, 50 pour 4 secondes et 60 pour 5 secondes. Un fond statique coûte 10 crédits." },
      { q: "Quand puis-je acheter des crédits ?", a: "Le checkout est en vérification finale avec notre prestataire de paiement. Les boutons d’achat restent désactivés jusqu’à l’ouverture du canal ; vous pouvez générer avec les crédits existants en attendant." },
      { q: "Les prix changent-ils ?", a: "Les coûts de cette page reflètent la configuration actuelle côté serveur. Le Studio affiche toujours le coût réel d’un travail avant de le lancer." },
    ],
  },
  de: {
    eyebrow: "Preise",
    title: "Preise & Credits",
    intro: "WallHaze nutzt einmalige Credit-Pakete — kein Abo. Credits bezahlen jede Generierung und verfallen nie.",
    packagesTitle: "Credit-Pakete",
    packagesIntro: "Alle Pakete sind einmalige Käufe in USD.",
    packages: [
      { name: "Starter", credits: "100", price: "$5", note: "≈ 10 statische Wallpaper" },
      { name: "Creator", credits: "500", price: "$20", note: "≈ 50 statische Wallpaper oder eine Mischung aus statischen und Live-Wallpapern" },
      { name: "Studio", credits: "2.000", price: "$69", note: "Am besten für Live-Wallpaper und größere Mengen" },
    ],
    packagesNote: "Credits verfallen nie und bleiben bis zur Verwendung in deiner Wallet.",
    genTitle: "Generierungskosten",
    genIntro: "Was jede Generierung an Credits kostet (beim Start des Auftrags reserviert):",
    genItems: [
      { name: "Statisches Wallpaper — Text-zu-Bild oder Referenzbild-Bearbeitung", cost: "10 Credits" },
      { name: "Live-Wallpaper — Bild-zu-Video, 5 Sekunden", cost: "40 Credits" },
      { name: "Live-Wallpaper — Text-zu-Video, 3 / 4 / 5 Sekunden", cost: "40 / 50 / 60 Credits" },
    ],
    genNote: "Credits werden während der Ausführung eines Auftrags gehalten und bei Fehlschlag automatisch freigegeben — eine fehlgeschlagene Generierung kostet dich nie etwas.",
    billingTitle: "Abrechnung",
    billingItems: [
      "Einmalige Käufe in USD — kein Abo, keine wiederkehrenden Gebühren.",
      "Credits verfallen nie.",
      "Reservierte Credits werden bei fehlgeschlagener Generierung automatisch freigegeben.",
      "Pakete werden nach Öffnung des Checkouts von unserem Zahlungsanbieter abgewickelt.",
    ],
    checkoutTitle: "Checkout öffnet bald",
    checkoutBody: "Käufe werden von unserem Zahlungsanbieter abgewickelt, und der Checkout-Kanal befindet sich in der abschließenden Prüfung. Kauf-Buttons bleiben deaktiviert, bis der Kanal öffnet — Generieren mit vorhandenen Credits funktioniert heute wie gewohnt.",
    checkoutComing: "Checkout bald verfügbar",
    faqTitle: "Preis-FAQ",
    faq: [
      { q: "Sind Credits ein Abo?", a: "Nein. Credit-Pakete sind einmalige Käufe in USD und Credits verfallen nie." },
      { q: "Was passiert, wenn eine Generierung fehlschlägt?", a: "Die für den Auftrag reservierten Credits werden automatisch freigegeben und dein Guthaben wiederhergestellt — fehlgeschlagene Generierungen kosten nichts." },
      { q: "Wie viel kostet ein Live-Wallpaper?", a: "Bild-zu-Video (5 s) kostet 40 Credits. Text-zu-Video kostet 40 Credits für 3 Sekunden, 50 für 4 Sekunden und 60 für 5 Sekunden. Ein statisches Wallpaper kostet 10 Credits." },
      { q: "Wann kann ich Credits kaufen?", a: "Der Checkout befindet sich mit unserem Zahlungsanbieter in der abschließenden Prüfung. Kauf-Buttons bleiben bis zur Kanalöffnung deaktiviert; in der Zwischenzeit kannst du mit vorhandenen Credits generieren." },
      { q: "Ändern sich die Preise?", a: "Die Kosten auf dieser Seite spiegeln die aktuelle serverseitige Konfiguration wider. Das Studio zeigt vor jedem Auftrag immer die tatsächlichen Kosten an." },
    ],
  },
};

for (const loc of LOCALES) {
  const path = new URL(`../messages/${loc}.json`, import.meta.url);
  const j = JSON.parse(readFileSync(path, "utf8"));

  // Effective date for the revised legal pages.
  j.terms.updated = UPDATED[loc];
  j.privacy.updated = UPDATED[loc];

  // Navigation + footer entries.
  j.nav.pricing = NAV_PRICING[loc];
  j.footer.pricing = FOOTER.pricing[loc];
  j.footer.acceptableUse = FOOTER.acceptableUse[loc];

  // Metadata for the two new public pages.
  j.meta.pricingTitle = META.pricingTitle[loc];
  j.meta.pricingDescription = META.pricingDescription[loc];
  j.meta.aupTitle = META.aupTitle[loc];
  j.meta.aupDescription = META.aupDescription[loc];

  // Terms: six Waffo categories + supplementary rules, plus the AUP link.
  const additions = PROHIBITED_ADD[loc];
  const existing = Array.isArray(j.terms.prohibitedItems)
    ? j.terms.prohibitedItems
    : [];
  const original = existing.filter((item) => !additions.includes(item));
  j.terms.prohibitedItems = [...original, ...additions];
  j.terms.prohibitedAupBody = TERMS_AUP.prohibitedAupBody[loc];
  j.terms.prohibitedAupLink = TERMS_AUP.prohibitedAupLink[loc];

  // Acceptable Use Policy page content.
  j.aup = {
    ...AUP[loc],
    updated: UPDATED[loc],
    categories: AUP[loc].categories.map(([name, body]) => ({ name, body })),
  };

  // Privacy: real data flow (fal.ai models, screening provider) + section.
  const falLine = PRIVACY_ITEM_FAL[loc];
  const screeningLine = PRIVACY_ITEM_SCREENING[loc];
  const thirdParty = Array.isArray(j.privacy.thirdPartyItems)
    ? j.privacy.thirdPartyItems
    : [];
  // Replace the generic fal.ai line with the detailed model disclosure,
  // drop any previous screening line, then append the screening provider.
  let falReplaced = false;
  const cleaned = [];
  for (const item of thirdParty) {
    if (item === screeningLine) continue;
    if (item === falLine || item.includes("fal.ai")) {
      if (!falReplaced) {
        cleaned.push(falLine);
        falReplaced = true;
      }
      continue;
    }
    cleaned.push(item);
  }
  if (!falReplaced) cleaned.push(falLine);
  cleaned.push(screeningLine);
  // Converge on re-runs: drop the previous (shorter) screening lines and
  // any duplicates introduced by an earlier version of this script.
  const OLD_SCREENING_LINE = {
    en: "A content-safety screening provider (Waffo) — automatically reviews prompts before a generation starts. Screening records keep the job id, the decision and — when reported — a violation category, not the prompt text.",
    zh: "内容安全筛查服务商（Waffo）——在生成开始前自动审查提示词。筛查记录仅保存任务 ID、判定结果与（如服务商报告）违规类别，不保存提示词文本。",
    ja: "コンテンツ安全審査プロバイダー（Waffo）— 生成開始前にプロンプトを自動審査します。審査記録にはジョブID、判定、（報告された場合は）違反カテゴリが保存され、プロンプト本文は保存されません。",
    ko: "콘텐츠 안전 심사 제공사(Waffo) — 생성이 시작되기 전 프롬프트를 자동으로 심사합니다. 심사 기록에는 작업 ID, 판정, (보고된 경우) 위반 카테고리가 저장되며 프롬프트 본문은 저장되지 않습니다.",
    es: "Un proveedor de revisión de seguridad de contenido (Waffo) — examina automáticamente los prompts antes de iniciar una generación. Los registros de revisión guardan el id del trabajo, la decisión y — si se reporta — una categoría de infracción, no el texto del prompt.",
    fr: "Un fournisseur d’examen de sécurité du contenu (Waffo) — examine automatiquement les prompts avant le lancement d’une génération. Les enregistrements d’examen conservent l’identifiant du travail, la décision et — si signalée — une catégorie de violation, pas le texte du prompt.",
    de: "Ein Anbieter von Inhaltssicherheitsprüfungen (Waffo) — prüft Prompts automatisch, bevor eine Generierung startet. Prüfprotokolle enthalten die Auftrags-ID, die Entscheidung und — sofern gemeldet — eine Verletzungskategorie, nicht den Prompt-Text.",
  }[loc];
  const deduped = [];
  for (const item of cleaned) {
    if (OLD_SCREENING_LINE && item === OLD_SCREENING_LINE) continue;
    // Older wording evolutions of the screening disclosure (any line that
    // names the output-moderation service but is not the current one).
    if (item.includes("OpenAI Moderation") && item !== screeningLine) continue;
    if (deduped.includes(item)) continue;
    deduped.push(item);
  }
  j.privacy.thirdPartyItems = deduped;
  j.privacy.screeningTitle = PRIVACY_SCREENING.screeningTitle[loc];
  j.privacy.screeningBody = PRIVACY_SCREENING.screeningBody[loc];

  // Studio model disclosure (page already renders these keys).
  for (const [key, value] of Object.entries(STUDIO)) {
    j.studio[key] = value[loc];
  }

  // About AI blurb.
  j.about.aiTitle = ABOUT_AI.aiTitle[loc];
  j.about.aiBody = ABOUT_AI.aiBody[loc];

  // Pricing page content (real configuration).
  j.pricing = PRICING[loc];

  // Moderation-chain error copy (generation error mapping).
  j.generator.errorModerationBlocked = MODERATION_ERRORS[loc].blocked;
  j.generator.errorModerationPending = MODERATION_ERRORS[loc].pending;
  j.generator.errorModerationUnavailable = MODERATION_ERRORS[loc].unavailable;
  j.generator.errorOutputBlocked = MODERATION_ERRORS[loc].outputBlocked;
  j.generator.errorOutputUnavailable = MODERATION_ERRORS[loc].outputUnavailable;

  writeFileSync(path, JSON.stringify(j, null, 2) + "\n");
  console.log("updated", loc);
}
