// Add model disclosure to About + Terms pages (x7 locales).
// Run: node scripts/i18n-model-disclosure.mjs
import { readFileSync, writeFileSync } from "node:fs";

const LOCALES = ["en", "zh", "ja", "ko", "es", "fr", "de"];

const M = {
  en: {
    aiModelsTitle: "AI Technology and Model Transparency",
    aiModelsIntro: "WallHaze uses the following third-party AI models, accessed through the fal.ai platform, to power its planned wallpaper creation features:",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "Text-to-image generation and reference-image editing for static wallpapers.",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "Image-to-video generation for 5-second live wallpapers at 720p.",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "Text-to-video generation for 3–5 second live wallpapers at 720p.",
    aiModelsNote: "These models are accessed through the fal.ai platform. WallHaze is not affiliated with the model publishers. Model availability and output can change as their providers update. AI wallpaper creation is not currently available to the public.",
    termsTitle: "9. AI Models and Service Providers",
    termsBody: "WallHaze's planned AI wallpaper creation features use the following third-party AI models, accessed through the fal.ai platform: FLUX.2 Klein 4B for text-to-image generation and reference-image editing (static wallpapers); Wan 2.2 5B for image-to-video generation (5-second live wallpapers at 720p); and Kling V3 Standard for text-to-video generation (3–5 second live wallpapers at 720p). These features are not currently available to the public. WallHaze is not affiliated with the model publishers. Model availability, output quality, and pricing may change as their providers update their services. We will update this section if the models or providers change.",
  },
  zh: {
    aiModelsTitle: "AI 技术与模型透明度",
    aiModelsIntro: "WallHaze 计划推出的壁纸创作功能使用以下第三方 AI 模型，均通过 fal.ai 平台访问：",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "文生图生成与参考图编辑，用于静态壁纸。",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "图生视频生成，用于 5 秒 720p 动态壁纸。",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "文生视频生成，用于 3–5 秒 720p 动态壁纸。",
    aiModelsNote: "以上模型通过 fal.ai 平台访问。WallHaze 与模型发布方无隶属关系。模型的可用性与输出可能随服务商更新而变化。AI 壁纸创作目前尚未向公众开放。",
    termsTitle: "9. AI 模型与服务商",
    termsBody: "WallHaze 计划推出的 AI 壁纸创作功能使用以下第三方 AI 模型，均通过 fal.ai 平台访问：FLUX.2 Klein 4B（文生图与参考图编辑，用于静态壁纸）；Wan 2.2 5B（图生视频，用于 5 秒 720p 动态壁纸）；Kling V3 Standard（文生视频，用于 3–5 秒 720p 动态壁纸）。这些功能目前尚未向公众开放。WallHaze 与模型发布方无隶属关系。模型的可用性、输出质量与价格可能随服务商更新而变化。如模型或服务商发生变更，我们将更新本章节。",
  },
  ja: {
    aiModelsTitle: "AIテクノロジーとモデルの透明性",
    aiModelsIntro: "WallHaze の予定している壁紙创作機能は、fal.ai プラットフォーム経由で以下のサードパーティ AI モデルを使用します：",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "テキストから画像の生成と参照画像の編集（静止画壁紙）。",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "画像から動画の生成（5秒・720pのライブ壁紙）。",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "テキストから動画の生成（3〜5秒・720pのライブ壁紙）。",
    aiModelsNote: "これらのモデルは fal.ai プラットフォーム経由でアクセスされます。WallHaze はモデルの公開元と提携していません。モデルの可用性と出力はプロバイダーの更新により変わる場合があります。AI壁紙创作は現在一般公開されていません。",
    termsTitle: "9. AIモデルとサービス提供者",
    termsBody: "WallHaze の予定している AI 壁紙创作機能は、fal.ai プラットフォーム経由で以下のサードパーティ AI モデルを使用します：FLUX.2 Klein 4B（テキストから画像の生成・参照画像の編集、静止画壁紙）；Wan 2.2 5B（画像から動画の生成、5秒・720pのライブ壁紙）；Kling V3 Standard（テキストから動画の生成、3〜5秒・720pのライブ壁紙）。これらの機能は現在一般公開されていません。WallHaze はモデルの公開元と提携していません。モデルの可用性・出力品質・価格はプロバイダーの更新により変わる場合があります。モデルやプロバイダーが変更された場合はこのセクションを更新します。",
  },
  ko: {
    aiModelsTitle: "AI 기술 및 모델 투명성",
    aiModelsIntro: "WallHaze의 계획된 배경화면创作 기능은 fal.ai 플랫폼을 통해 다음 서드파티 AI 모델을 사용합니다:",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "텍스트→이미지 생성 및 참조 이미지 편집 (정적 배경화면).",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "이미지→비디오 생성 (5초 720p 라이브 배경화면).",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "텍스트→비디오 생성 (3-5초 720p 라이브 배경화면).",
    aiModelsNote: "이 모델들은 fal.ai 플랫폼을 통해 이용됩니다. WallHaze는 모델 게시사와 제휴 관계가 없습니다. 모델 가용성과 출력은 제공사 업데이트에 따라 달라질 수 있습니다. AI 배경화면创作은 현재 일반 공개되지 않았습니다.",
    termsTitle: "9. AI 모델 및 서비스 제공사",
    termsBody: "WallHaze의 계획된 AI 배경화면创作 기능은 fal.ai 플랫폼을 통해 다음 서드파티 AI 모델을 사용합니다: FLUX.2 Klein 4B(텍스트→이미지 생성 및 참조 이미지 편집, 정적 배경화면); Wan 2.2 5B(이미지→비디오 생성, 5초 720p 라이브 배경화면); Kling V3 Standard(텍스트→비디오 생성, 3-5초 720p 라이브 배경화면). 이러한 기능은 현재 일반 공개되지 않았습니다. WallHaze는 모델 게시사와 제휴 관계가 없습니다. 모델 가용성, 출력 품질, 가격은 제공사 업데이트에 따라 변경될 수 있습니다. 모델이나 제공사가 변경되면 이 섹션을 업데이트합니다.",
  },
  es: {
    aiModelsTitle: "Tecnología de IA y transparencia de modelos",
    aiModelsIntro: "Las funciones planificadas de creación de fondos de WallHaze utilizan los siguientes modelos de IA de terceros, accesidos a través de la plataforma fal.ai:",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "Generación de texto a imagen y edición con imagen de referencia para fondos estáticos.",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "Generación de imagen a vídeo para fondos dinámicos de 5 segundos a 720p.",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "Generación de texto a vídeo para fondos dinámicos de 3–5 segundos a 720p.",
    aiModelsNote: "Estos modelos se acceden a través de la plataforma fal.ai. WallHaze no está afiliado a los editores de los modelos. La disponibilidad y los resultados pueden cambiar según las actualizaciones de sus proveedores. La creación de fondos con IA no está disponible actualmente al público.",
    termsTitle: "9. Modelos de IA y proveedores de servicios",
    termsBody: "Las funciones planificadas de creación de fondos con IA de WallHaze utilizan los siguientes modelos de IA de terceros, accesidos a través de la plataforma fal.ai: FLUX.2 Klein 4B para generación de texto a imagen y edición con referencia (fondos estáticos); Wan 2.2 5B para generación de imagen a vídeo (fondos dinámicos de 5 segundos a 720p); y Kling V3 Standard para generación de texto a vídeo (fondos dinámicos de 3–5 segundos a 720p). Estas funciones no están disponibles actualmente al público. WallHaze no está afiliado a los editores de los modelos. La disponibilidad, calidad y precios pueden cambiar según las actualizaciones de los proveedores. Actualizaremos esta sección si los modelos o proveedores cambian.",
  },
  fr: {
    aiModelsTitle: "Technologie IA et transparence des modèles",
    aiModelsIntro: "Les fonctionnalités planifiées de création de fonds de WallHaze utilisent les modèles d'IA tiers suivants, accessibles via la plateforme fal.ai :",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "Génération de texte vers image et édition avec image de référence pour les fonds statiques.",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "Génération d'image vers vidéo pour des fonds animés de 5 secondes en 720p.",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "Génération de texte vers vidéo pour des fonds animés de 3 à 5 secondes en 720p.",
    aiModelsNote: "Ces modèles sont accessibles via la plateforme fal.ai. WallHaze n'est pas affilié aux éditeurs des modèles. La disponibilité et les résultats peuvent changer selon les mises à jour de leurs fournisseurs. La création de fonds par IA n'est pas disponible actuellement au public.",
    termsTitle: "9. Modèles d'IA et fournisseurs de services",
    termsBody: "Les fonctionnalités planifiées de création de fonds par IA de WallHaze utilisent les modèles d'IA tiers suivants, accessibles via la plateforme fal.ai : FLUX.2 Klein 4B pour la génération de texte vers image et l'édition avec référence (fonds statiques) ; Wan 2.2 5B pour la génération d'image vers vidéo (fonds animés de 5 secondes en 720p) ; et Kling V3 Standard pour la génération de texte vers vidéo (fonds animés de 3 à 5 secondes en 720p). Ces fonctionnalités ne sont pas disponibles actuellement au public. WallHaze n'est pas affilié aux éditeurs des modèles. La disponibilité, la qualité et les prix peuvent évoluer selon les mises à jour des fournisseurs. Nous mettrons à jour cette section si les modèles ou fournisseurs changent.",
  },
  de: {
    aiModelsTitle: "KI-Technologie und Modelltransparenz",
    aiModelsIntro: "Die geplanten Wallpaper-Erstellungsfunktionen von WallHaze nutzen die folgenden KI-Modelle von Drittanbietern, zugänglich über die fal.ai-Plattform:",
    aiModelImage: "FLUX.2 Klein 4B",
    aiModelImageUse: "Text-zu-Bild-Generierung und Referenzbild-Bearbeitung für statische Wallpaper.",
    aiModelI2v: "Wan 2.2 5B",
    aiModelI2vUse: "Bild-zu-Video-Generierung für 5-Sekunden-Live-Wallpaper bei 720p.",
    aiModelT2v: "Kling V3 Standard",
    aiModelT2vUse: "Text-zu-Video-Generierung für 3–5 Sekunden Live-Wallpaper bei 720p.",
    aiModelsNote: "Diese Modelle werden über die fal.ai-Plattform genutzt. WallHaze steht in keiner Verbindung zu den Modell-Herausgebern. Verfügbarkeit und Ergebnisse können sich mit Anbieter-Updates ändern. Die KI-Wallpaper-Erstellung ist derzeit nicht öffentlich verfügbar.",
    termsTitle: "9. KI-Modelle und Dienstanbieter",
    termsBody: "Die geplanten KI-Wallpaper-Erstellungsfunktionen von WallHaze nutzen die folgenden KI-Modelle von Drittanbietern, zugänglich über die fal.ai-Plattform: FLUX.2 Klein 4B für Text-zu-Bild-Generierung und Referenzbild-Bearbeitung (statische Wallpaper); Wan 2.2 5B für Bild-zu-Video-Generierung (5-Sekunden-Live-Wallpaper bei 720p); und Kling V3 Standard für Text-zu-Video-Generierung (3–5 Sekunden Live-Wallpaper bei 720p). Diese Funktionen sind derzeit nicht öffentlich verfügbar. WallHaze steht in keiner Verbindung zu den Modell-Herausgebern. Verfügbarkeit, Ausgabequalität und Preise können sich mit Anbieter-Updates ändern. Wir aktualisieren diesen Abschnitt, wenn sich Modelle oder Anbieter ändern.",
  },
};

for (const loc of LOCALES) {
  const p = `messages/${loc}.json`;
  const j = JSON.parse(readFileSync(p, "utf8"));
  const c = M[loc];
  j.about.aiModelsTitle = c.aiModelsTitle;
  j.about.aiModelsIntro = c.aiModelsIntro;
  j.about.aiModelImage = c.aiModelImage;
  j.about.aiModelImageUse = c.aiModelImageUse;
  j.about.aiModelI2v = c.aiModelI2v;
  j.about.aiModelI2vUse = c.aiModelI2vUse;
  j.about.aiModelT2v = c.aiModelT2v;
  j.about.aiModelT2vUse = c.aiModelT2vUse;
  j.about.aiModelsNote = c.aiModelsNote;
  j.terms.aiModelsTitle = c.termsTitle;
  j.terms.aiModelsBody = c.termsBody;
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(loc, "updated");
}
