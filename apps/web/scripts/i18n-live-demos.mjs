// Update live-demo gallery copy for all seven locales (batch rewrite).
import { readFileSync, writeFileSync } from "node:fs";

const COPY = {
  en: {
    liveDemoTitle: "Original live wallpapers in motion",
    liveDemoBody: "Six original AI-generated live wallpapers — haunted manor, sakura night, neon rain, mecha, deep space and dark fantasy — each a real looping video.",
    liveDemoBadge: "Live demo",
    liveDemoAiNote: "Original AI-generated live wallpapers by WallHaze · silent · looping · free to watch",
    liveDemoDesktopNote: "The current demos are desktop-format (16:9); they play on any device.",
    liveDemoCta: "Create yours in the Studio",
    demos: {
      "haunted-manor": ["Haunted Manor", "Gothic manor under moonlight with blue mist drifting and a flickering window"],
      "sakura-night-anime": ["Sakura Night", "Original anime girl beneath blossoming branches as petals drift and her hair sways"],
      "seoul-neon-rain": ["Seoul Neon Rain", "Rainy Korean alley with blue-violet neon reflections shimmering on wet asphalt"],
      "mecha-awakening": ["Mecha Awakening", "Original mecha with a pulsing energy core, cycling lights and drifting particles"],
      "interstellar-frontier": ["Interstellar Frontier", "Orbital station over a ringed planet with twinkling stars and drifting particles"],
      "dragon-realm": ["Dragon Realm", "Dragon silhouette over an ancient citadel under a violet magic sky with distant lightning"],
    },
  },
  zh: {
    liveDemoTitle: "原创动态壁纸演示",
    liveDemoBody: "六段 WallHaze 原创 AI 生成的动态壁纸——暗夜凶宅、樱花之夜、霓虹首尔、机甲觉醒、星际边界、魔龙之境——每段都是真实循环视频。",
    liveDemoBadge: "动态演示",
    liveDemoAiNote: "WallHaze 原创 AI 生成动态壁纸 · 无声 · 循环播放 · 免费观看",
    liveDemoDesktopNote: "当前演示为桌面比例（16:9），可在任何设备上播放。",
    liveDemoCta: "去 Studio 创作你的",
    demos: {
      "haunted-manor": ["暗夜凶宅", "月光下的哥特洋馆，蓝色浓雾流动，窗户灯光轻闪"],
      "sakura-night-anime": ["樱花之夜", "原创动漫少女立于樱花树下，花瓣缓缓飘落，发丝轻摆"],
      "seoul-neon-rain": ["霓虹首尔", "雨夜韩国小巷，蓝紫霓虹在湿漉路面上闪烁倒影"],
      "mecha-awakening": ["机甲觉醒", "原创机甲伫立科技都市，能量核心脉冲，灯光循环，粒子漂浮"],
      "interstellar-frontier": ["星际边界", "轨道空间站悬于环行星之上，星光闪烁，粒子缓缓漂浮"],
      "dragon-realm": ["魔龙之境", "巨龙剪影盘旋古代城堡上空，紫色魔法天空，远处闪电"],
    },
  },
  ja: {
    liveDemoTitle: "オリジナルライブ壁紙デモ",
    liveDemoBody: "WallHaze オリジナルの AI 生成ライブ壁紙6作品 — 洋館、桜、ネオン、メカ、宇宙、ドラゴン。すべて実際にループする動画です。",
    liveDemoBadge: "ライブデモ",
    liveDemoAiNote: "WallHaze オリジナル AI 生成ライブ壁紙 · 無音 · ループ · 視聴無料",
    liveDemoDesktopNote: "現在のデモはデスクトップ比率（16:9）。どの端末でも再生できます。",
    liveDemoCta: "Studio でつくる",
    demos: {
      "haunted-manor": ["洋館の夜", "月光のゴシック洋館、青い霧が流れ、窓の灯が瞬く"],
      "sakura-night-anime": ["桜の夜", "桜の樹の下のオリジナル少女、花びらが舞い髪が揺れる"],
      "seoul-neon-rain": ["ネオンの雨", "雨の韓国路地、藍紫ネオンが濡れた路面に揺れる"],
      "mecha-awakening": ["メカ覚醒", "オリジナルメカ、エネルギーコアが脈動し光が循環"],
      "interstellar-frontier": ["星の果て", "環状惑星と宇宙ステーション、瞬く星と漂う粒子"],
      "dragon-realm": ["魔竜の境", "古代城塞に舞うドラゴン、紫の魔法空と遠雷"],
    },
  },
  ko: {
    liveDemoTitle: "오리지널 라이브 배경화면 데모",
    liveDemoBody: "WallHaze 오리지널 AI 생성 라이브 배경화면 6편 — 저택, 벚꽃, 네온, 메카, 우주, 드래곤 — 모두 실제 루프 영상입니다.",
    liveDemoBadge: "라이브 데모",
    liveDemoAiNote: "WallHaze 오리지널 AI 생성 라이브 배경화면 · 무음 · 반복 · 무료 시청",
    liveDemoDesktopNote: "현재 데모는 데스크톱 비율(16:9)이며 어떤 기기에서도 재생됩니다.",
    liveDemoCta: "Studio에서 만들기",
    demos: {
      "haunted-manor": ["폐저택의 밤", "달빛 고딕 저택, 푸른 안개가 흐르고 창문이 깜빡임"],
      "sakura-night-anime": ["벚꽃의 밤", "벚꽃 나뭇가지 아래 오리지널 소녀, 꽃잎이 흩날리고 머리카락이 흔들림"],
      "seoul-neon-rain": ["네온 서울", "비 내리는 한국 골목, 젖은 아스팔트에 흔들리는 청자 네온"],
      "mecha-awakening": ["메카 각성", "오리지널 메카, 펄스하는 에너지 코어와 순환하는 조명"],
      "interstellar-frontier": ["성간 경계", "고리 모양 행성 위 궤도 정거장, 반짝이는 별과 표류하는 입자"],
      "dragon-realm": ["마룡의 영역", "고대 성채 위를 도는 드래곤 실루엣, 보라색 마법의 하늘"],
    },
  },
  es: {
    liveDemoTitle: "Fondos dinámicos originales",
    liveDemoBody: "Seis fondos dinámicos originales generados por IA — mansión, sakura, neón, mecha, espacio y fantasía — cada uno un vídeo real en bucle.",
    liveDemoBadge: "Demostración",
    liveDemoAiNote: "Fondos dinámicos originales de WallHaze generados por IA · silenciosos · en bucle · gratis",
    liveDemoDesktopNote: "Las demos actuales son formato escritorio (16:9); se reproducen en cualquier dispositivo.",
    liveDemoCta: "Crea el tuyo en el Studio",
    demos: {
      "haunted-manor": ["Mansión embrujada", "Mansión gótica a la luz de la luna con niebla azul y una ventana parpadeante"],
      "sakura-night-anime": ["Noche de sakura", "Chica anime original bajo las ramas en flor mientras caen pétalos"],
      "seoul-neon-rain": ["Neón de Seúl", "Callejón coreano lluvioso con reflejos azul-violeta sobre el asfalto"],
      "mecha-awakening": ["Mecha despierto", "Mecha original con núcleo de energía pulsante y luces en ciclo"],
      "interstellar-frontier": ["Frontera interestelar", "Estación orbital sobre un planeta anillado con estrellas titilantes"],
      "dragon-realm": ["Reino del dragón", "Silueta de dragón sobre una ciudadela bajo un cielo violeta mágico"],
    },
  },
  fr: {
    liveDemoTitle: "Fonds animés originaux",
    liveDemoBody: "Six fonds animés originaux générés par IA — manoir, sakura, néon, mecha, espace et fantasy — chacun une vraie vidéo en boucle.",
    liveDemoBadge: "Démo animée",
    liveDemoAiNote: "Fonds animés originaux de WallHaze générés par IA · silencieux · en boucle · gratuits",
    liveDemoDesktopNote: "Les démos actuelles sont au format bureau (16:9) ; elles se lisent sur tout appareil.",
    liveDemoCta: "Créez le vôtre dans le Studio",
    demos: {
      "haunted-manor": ["Manoir hanté", "Manoir gothique au clair de lune, brume bleue et fenêtre vacillante"],
      "sakura-night-anime": ["Nuit de sakura", "Fille anime originale sous les branches fleuries, pétales et cheveux au vent"],
      "seoul-neon-rain": ["Pluie sur Séoul", "Ruelle coréenne sous la pluie, néons bleu-violet miroitant sur l'asphalte"],
      "mecha-awakening": ["Éveil du mecha", "Mecha original avec noyau d'énergie pulsant et lumières cyclées"],
      "interstellar-frontier": ["Frontière interstellaire", "Station orbitale sur une planète annelée, étoiles et particules"],
      "dragon-realm": ["Royaume du dragon", "Silhouette de dragon sur une citadelle sous un ciel violet magique"],
    },
  },
  de: {
    liveDemoTitle: "Originale Live-Wallpaper-Demos",
    liveDemoBody: "Sechs originale KI-generierte Live-Wallpaper — Herrenhaus, Sakura, Neon, Mecha, Weltraum und Fantasy — jedes ein echtes Loop-Video.",
    liveDemoBadge: "Live-Demo",
    liveDemoAiNote: "WallHaze originale KI-generierte Live-Wallpaper · stumm · loopend · kostenlos",
    liveDemoDesktopNote: "Aktuelle Demos im Desktop-Format (16:9); sie laufen auf jedem Gerät.",
    liveDemoCta: "Im Studio erstellen",
    demos: {
      "haunted-manor": ["Verfluchtes Herrenhaus", "Gothic-Herrenhaus im Mondlicht, blaues Nebeltreiben, flackerndes Fenster"],
      "sakura-night-anime": ["Sakura-Nacht", "Original-Anime-Mädchen unter blühenden Zweigen, fallende Blüten, wehendes Haar"],
      "seoul-neon-rain": ["Neon-Regen", "Regnerische koreanische Gasse, blau-violettes Neon auf nassem Asphalt"],
      "mecha-awakening": ["Mecha-Erwachen", "Original-Mecha mit pulsierendem Energiekern und zyklischen Lichtern"],
      "interstellar-frontier": ["Interstellare Grenze", "Orbitalstation über Ringplaneten, funkelnde Sterne, treibende Partikel"],
      "dragon-realm": ["Drachenreich", "Drachensilhouette über einer alten Zitadelle, violetter Magenhimmel"],
    },
  },
};

for (const loc of Object.keys(COPY)) {
  const p = `messages/${loc}.json`;
  const j = JSON.parse(readFileSync(p, "utf8"));
  const c = COPY[loc];
  j.gallery.liveDemoTitle = c.liveDemoTitle;
  j.gallery.liveDemoBody = c.liveDemoBody;
  j.gallery.liveDemoBadge = c.liveDemoBadge;
  j.gallery.liveDemoAiNote = c.liveDemoAiNote;
  j.gallery.liveDemoDesktopNote = c.liveDemoDesktopNote;
  j.gallery.liveDemoCta = c.liveDemoCta;
  // The old page claimed "not AI output" — that is no longer true.
  delete j.gallery.liveDemoNotAi;
  for (const [id, pair] of Object.entries(c.demos)) {
    j.gallery.liveDemos[id] = { title: pair[0], alt: pair[1] };
  }
  writeFileSync(p, JSON.stringify(j, null, 2) + "\n");
  console.log(loc, "updated");
}
