/**
 * @module app/display_tuning
 * display_tuning.js — DISPLAY_TUNING ウィンドウ
 *
 * ピクセルグリッドのエフェクトパラメータ (Vignette, Diagonal, Glow) を
 * GUI から調整する設定パネル。変更は即座にエフェクトに反映され、
 * localStorage に永続化される。
 */

import * as Config from "../config.js";
import { wmOpen, wmRegister, wmSetContentSize } from "../wm/index.js";
import {
  Label,
  Slider,
  NumberBox,
  ToggleButton,
  HSep,
  WidgetGroup,
  HBox,
  VBox,
  FOCUS_MARGIN,
  textWidth,
} from "../ui/index.js";

const APP_NAME = "DISPLAY_TUNING";

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  定数
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

const SLIDER_W = 80;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  値フォーマット
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

function formatPercent(v) {
  return String(v).padStart(4) + "%";
}

// SPEED は 0–100 の無次元スケール値なので単位なし
function formatPx(v) {
  return String(v).padStart(4);
}

function formatDot(v) {
  return String(v).padStart(4) + "DOT";
}

/** ラベルのテキストと幅を更新する */
function setLabel(lbl, str) {
  lbl.text = str;
  lbl.w = textWidth(str);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィジェット生成
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

let lblPixelGrid, tglPixelGrid;

let lblVignette, tglVignette;
let lblVigStrength, sldVigStrength, valVigStrength;
let lblVigRadius, sldVigRadius, valVigRadius;

let lblDiagonal, tglDiagonal;
let lblDiagDarkness, sldDiagDarkness, valDiagDarkness;
let lblDiagSpeed, sldDiagSpeed, valDiagSpeed;
let lblDiagSpacing, nbDiagSpacing;
let lblDiagThickness, nbDiagThickness;

let lblGlow, tglGlow;
let lblGlowIntensity, sldGlowIntensity, valGlowIntensity;

let lblNoise, tglNoise;
let lblNoiseStrength, sldNoiseStrength, valNoiseStrength;

let sep0, sep1, sep2, sep3;
let vigToggleRow, diagToggleRow, glowToggleRow, noiseToggleRow;
let vigRows, diagRows, glowRows, noiseRows;
let allEffectToggleRows, allEffectSeparators;
let tuningRoot;
let tuningWidgets;

let maxLabelWidth = 0;
let allLabels = [];

let _ready = false;
function _initWidgets() {
  if (_ready) return;
  _ready = true;

  const ep = Config.getEffectParams();

  // ── Pixel Grid (master toggle) ──
  // OFF にすると LCD ドット/ギャップ構造が中和され、ブロック状の 3x 拡大になる。
  // Glow / Diagonal は gap/diag 位置に依存するため意味を失うため、
  // refreshVisibility で 4 エフェクト全体を非表示にする。
  lblPixelGrid = new Label(0, 0, "Pixel grid:");
  tglPixelGrid = new ToggleButton(
    0,
    0,
    "ON",
    (v) => {
      Config.setEffectParam("pixelGridEnabled", v);
      refreshVisibility();
    },
    ep.pixelGridEnabled,
  );

  // ── Vignette ──
  lblVignette = new Label(0, 0, "Vignette:");
  tglVignette = new ToggleButton(
    0,
    0,
    "ON",
    (v) => {
      Config.setEffectParam("vignetteEnabled", v);
      refreshVisibility();
    },
    ep.vignetteEnabled,
  );

  lblVigStrength = new Label(0, 0, "Strength:");
  valVigStrength = new Label(0, 0, formatPercent(ep.vignetteStrength));
  sldVigStrength = new Slider(
    0,
    0,
    SLIDER_W,
    0,
    100,
    ep.vignetteStrength,
    (v) => {
      setLabel(valVigStrength, formatPercent(v));
      Config.setEffectParam("vignetteStrength", v);
    },
  );

  lblVigRadius = new Label(0, 0, "Radius:");
  valVigRadius = new Label(0, 0, formatPercent(ep.vignetteRadius));
  sldVigRadius = new Slider(0, 0, SLIDER_W, 0, 50, ep.vignetteRadius, (v) => {
    setLabel(valVigRadius, formatPercent(v));
    Config.setEffectParam("vignetteRadius", v);
  });

  // ── Diagonal ──
  lblDiagonal = new Label(0, 0, "Diagonal:");
  tglDiagonal = new ToggleButton(
    0,
    0,
    "ON",
    (v) => {
      Config.setEffectParam("diagEnabled", v);
      refreshVisibility();
    },
    ep.diagEnabled,
  );

  lblDiagDarkness = new Label(0, 0, "Darkness:");
  valDiagDarkness = new Label(0, 0, formatPercent(ep.diagDarkness));
  sldDiagDarkness = new Slider(0, 0, SLIDER_W, 0, 100, ep.diagDarkness, (v) => {
    setLabel(valDiagDarkness, formatPercent(v));
    Config.setEffectParam("diagDarkness", v);
  });

  lblDiagSpeed = new Label(0, 0, "Speed:");
  valDiagSpeed = new Label(0, 0, formatPx(ep.diagSpeed));
  sldDiagSpeed = new Slider(0, 0, SLIDER_W, 0, 100, ep.diagSpeed, (v) => {
    setLabel(valDiagSpeed, formatPx(v));
    Config.setEffectParam("diagSpeed", v);
  });

  lblDiagSpacing = new Label(0, 0, "Spacing:");
  nbDiagSpacing = new NumberBox(0, 0, 2, 16, ep.diagSpacing, 1, () => {
    const s = nbDiagSpacing.value;
    Config.setEffectParam("diagSpacing", s);
    // thickness の max を spacing - 1 にクランプ
    if (nbDiagThickness.value >= s) {
      nbDiagThickness.value = s - 1;
      Config.setEffectParam("diagThickness", s - 1);
    }
    nbDiagThickness.max = s - 1;
  });

  lblDiagThickness = new Label(0, 0, "Thickness:");
  nbDiagThickness = new NumberBox(
    0,
    0,
    1,
    ep.diagSpacing - 1,
    ep.diagThickness,
    1,
    () => {
      Config.setEffectParam("diagThickness", nbDiagThickness.value);
    },
  );

  // ── Glow ──
  lblGlow = new Label(0, 0, "Glow:");
  tglGlow = new ToggleButton(
    0,
    0,
    "ON",
    (v) => {
      Config.setEffectParam("glowEnabled", v);
      refreshVisibility();
    },
    ep.glowEnabled,
  );

  lblGlowIntensity = new Label(0, 0, "Intensity:");
  valGlowIntensity = new Label(0, 0, formatPercent(ep.glowIntensity));
  sldGlowIntensity = new Slider(
    0,
    0,
    SLIDER_W,
    0,
    100,
    ep.glowIntensity,
    (v) => {
      setLabel(valGlowIntensity, formatPercent(v));
      Config.setEffectParam("glowIntensity", v);
    },
  );

  // ── Noise ──
  lblNoise = new Label(0, 0, "Noise:");
  tglNoise = new ToggleButton(
    0,
    0,
    "ON",
    (v) => {
      Config.setEffectParam("noiseEnabled", v);
      refreshVisibility();
    },
    ep.noiseEnabled,
  );

  lblNoiseStrength = new Label(0, 0, "Strength:");
  valNoiseStrength = new Label(0, 0, formatPercent(ep.noiseStrength));
  sldNoiseStrength = new Slider(0, 0, SLIDER_W, 0, 100, ep.noiseStrength, (v) => {
    setLabel(valNoiseStrength, formatPercent(v));
    Config.setEffectParam("noiseStrength", v);
  });

  // ── セパレータ ──
  sep0 = new HSep(0, 0, 0); // Pixel Grid と 4 エフェクト群の境界
  sep1 = new HSep(0, 0, 0);
  sep2 = new HSep(0, 0, 0);
  sep3 = new HSep(0, 0, 0);

  // ── ラベル幅統一 ──
  allLabels = [
    lblPixelGrid,
    lblVignette,
    lblVigStrength,
    lblVigRadius,
    lblDiagonal,
    lblDiagDarkness,
    lblDiagSpeed,
    lblDiagSpacing,
    lblDiagThickness,
    lblGlow,
    lblGlowIntensity,
    lblNoise,
    lblNoiseStrength,
  ];
  maxLabelWidth = Math.max(...allLabels.map((l) => l.w));
  for (const l of allLabels) l.w = maxLabelWidth;

  // ── レイアウト ──
  const vigStrengthRow = HBox([lblVigStrength, sldVigStrength, valVigStrength]);
  const vigRadiusRow = HBox([lblVigRadius, sldVigRadius, valVigRadius]);
  vigRows = [vigStrengthRow, vigRadiusRow];

  const diagDarknessRow = HBox([
    lblDiagDarkness,
    sldDiagDarkness,
    valDiagDarkness,
  ]);
  const diagSpeedRow = HBox([lblDiagSpeed, sldDiagSpeed, valDiagSpeed]);
  const diagSpacingRow = HBox([lblDiagSpacing, nbDiagSpacing, new Label(0, 0, "DOT")]);
  const diagThicknessRow = HBox([lblDiagThickness, nbDiagThickness, new Label(0, 0, "DOT")]);
  diagRows = [diagDarknessRow, diagSpeedRow, diagSpacingRow, diagThicknessRow];

  const glowIntensityRow = HBox([
    lblGlowIntensity,
    sldGlowIntensity,
    valGlowIntensity,
  ]);
  glowRows = [glowIntensityRow];

  const noiseStrengthRow = HBox([lblNoiseStrength, sldNoiseStrength, valNoiseStrength]);
  noiseRows = [noiseStrengthRow];

  vigToggleRow = HBox([lblVignette, tglVignette]);
  diagToggleRow = HBox([lblDiagonal, tglDiagonal]);
  glowToggleRow = HBox([lblGlow, tglGlow]);
  noiseToggleRow = HBox([lblNoise, tglNoise]);

  // Pixel Grid OFF 時に一括で隠す対象。
  allEffectToggleRows = [vigToggleRow, diagToggleRow, glowToggleRow, noiseToggleRow];
  allEffectSeparators = [sep1, sep2, sep3];

  tuningRoot = VBox([
    HBox([lblPixelGrid, tglPixelGrid]),
    sep0,
    vigToggleRow,
    vigStrengthRow,
    vigRadiusRow,
    sep1,
    diagToggleRow,
    diagDarknessRow,
    diagSpeedRow,
    diagSpacingRow,
    diagThicknessRow,
    sep2,
    glowToggleRow,
    glowIntensityRow,
    sep3,
    noiseToggleRow,
    noiseStrengthRow,
  ]);

  tuningRoot.layout(FOCUS_MARGIN, FOCUS_MARGIN);
  tuningWidgets = new WidgetGroup(tuningRoot.leaves());

  refreshVisibility();
}

/**
 * トグル状態に応じて行の表示/非表示を更新する。
 *
 * 階層構造:
 *   Pixel Grid OFF → 4 エフェクト全体 (トグル行・パラメータ行・セパレータ) を非表示。
 *                    Glow / Diagonal は gap/diag 位置依存で意味を失い、
 *                    Vignette / Noise も「ピクセルグリッド OFF にしたい人は
 *                    徹底的にミニマルにしたい人」とみなして一括で隠す。
 *   Pixel Grid ON  → 各エフェクトのトグル行は常に表示、
 *                    パラメータ行は各エフェクトの個別トグル ON のときのみ表示。
 */
function refreshVisibility() {
  const pgOn = tglPixelGrid.value;

  // sep0 (Pixel Grid と効果群の境界) は Pixel Grid OFF 時のみ
  // 「効果群を隠したことを示す区切り」を残す意味で表示してもよいが、
  // 隠した方が空間として綺麗 (区切る対象が無くなるため) なので一緒に隠す。
  sep0.visible = pgOn;

  for (const row of allEffectToggleRows) row.visible = pgOn;
  for (const sep of allEffectSeparators) sep.visible = pgOn;

  // パラメータ行: Pixel Grid ON かつ各エフェクト ON のときだけ表示
  const vigOn = pgOn && tglVignette.value;
  for (const row of vigRows) row.visible = vigOn;

  const diagOn = pgOn && tglDiagonal.value;
  for (const row of diagRows) row.visible = diagOn;

  const glowOn = pgOn && tglGlow.value;
  for (const row of glowRows) row.visible = glowOn;

  const noiseOn = pgOn && tglNoise.value;
  for (const row of noiseRows) row.visible = noiseOn;

  tuningRoot.layout(FOCUS_MARGIN, FOCUS_MARGIN);
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  ウィンドウ登録
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

wmRegister(APP_NAME, () => {
  _initWidgets();

  // ウィジェットの値を最新の Config から同期
  const ep = Config.getEffectParams();
  tglPixelGrid.value = ep.pixelGridEnabled;
  tglVignette.value = ep.vignetteEnabled;
  sldVigStrength.value = ep.vignetteStrength;
  setLabel(valVigStrength, formatPercent(ep.vignetteStrength));
  sldVigRadius.value = ep.vignetteRadius;
  setLabel(valVigRadius, formatPercent(ep.vignetteRadius));
  tglDiagonal.value = ep.diagEnabled;
  sldDiagDarkness.value = ep.diagDarkness;
  setLabel(valDiagDarkness, formatPercent(ep.diagDarkness));
  sldDiagSpeed.value = ep.diagSpeed;
  setLabel(valDiagSpeed, formatPx(ep.diagSpeed));
  nbDiagSpacing.value = ep.diagSpacing;
  nbDiagThickness.max = ep.diagSpacing - 1;
  nbDiagThickness.value = ep.diagThickness;
  tglGlow.value = ep.glowEnabled;
  sldGlowIntensity.value = ep.glowIntensity;
  setLabel(valGlowIntensity, formatPercent(ep.glowIntensity));
  tglNoise.value = ep.noiseEnabled;
  sldNoiseStrength.value = ep.noiseStrength;
  setLabel(valNoiseStrength, formatPercent(ep.noiseStrength));
  refreshVisibility();

  const id = wmOpen(
    -1,
    -1,
    0,
    0,
    APP_NAME,
    (contentRect) => {
      const size = tuningRoot.measure();
      wmSetContentSize(id, size.h);
      tuningWidgets.draw(contentRect);
    },
    (ev) => tuningWidgets.update(ev),
    () => tuningRoot.measure(),
    {
      scrollable: true,
      onRelayout: () => {
        tuningWidgets.remeasureAll();
        maxLabelWidth = Math.max(...allLabels.map((l) => l.w));
        for (const l of allLabels) l.w = maxLabelWidth;
        tuningRoot.layout(FOCUS_MARGIN, FOCUS_MARGIN);
      },
    },
  );
  return id;
}, { shortName: "TUNING" });

