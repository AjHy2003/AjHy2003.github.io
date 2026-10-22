// "Weather Station Radio" theme: a 1940s tabletop radio. Tokens match the
// Claude Design style guide (design/StyleGuide.dc.html).
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G, Line, Path, Text as SvgText } from 'react-native-svg';

export const C = {
  walnut: '#3b2416',
  bakelite: '#1c1714',
  cream: '#f3e6c8',
  paper: '#fff7e6',
  field: '#fffaf0',
  brass: '#c9a24a',
  gold: '#e9c46a',
  amber: '#f2a93b',
  red: '#c8402a',
  hot: '#a3321f',
  steel: '#2f5d73',
  cold: '#5b8fa8',
  ink: '#2a1d14',
  muted: '#6b5642',
  label: '#d8c4a0',
  tan: '#d9c49a',
  rule: '#b39a72',
};

export const F = {
  display: 'Righteous_400Regular',
  label: 'BarlowCondensed_600SemiBold',
  labelBold: 'BarlowCondensed_700Bold',
  body: 'BarlowCondensed_500Medium',
  mono: 'CourierPrime_400Regular',
  monoBold: 'CourierPrime_700Bold',
};

// Cream dial-face panel with brass trim.
export function Dial({ style, children }) {
  return <View style={[s.dial, style]}>{children}</View>;
}

// Small black bakelite readout box.
export function Readout({ label, value, style }) {
  return (
    <View style={[s.readout, style]}>
      <Text style={s.readoutLabel}>{label}</Text>
      <Text style={s.readoutValue} numberOfLines={1} adjustsFontSizeToFit>
        {value}
      </Text>
    </View>
  );
}

export function Title({ title, subtitle }) {
  return (
    <View style={s.titleBox}>
      <Text style={s.title}>{title}</Text>
      {subtitle ? <Text style={s.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled, style }) {
  const v = variant === 'primary' ? s.btnPrimary : variant === 'gold' ? s.btnGold : s.btnSecondary;
  const t = variant === 'primary' ? s.btnPrimaryText : variant === 'gold' ? s.btnGoldText : s.btnSecondaryText;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [s.btn, v, (pressed || disabled) && { opacity: 0.7 }, style]}
    >
      <Text style={t}>{label}</Text>
    </Pressable>
  );
}

// Bakelite toggle switch.
export function Toggle({ value, onChange, label }) {
  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      onPress={() => onChange(!value)}
      style={[s.toggle, value ? s.toggleOn : s.toggleOff]}
    >
      <View style={[s.knob, { backgroundColor: value ? C.amber : C.muted }]} />
    </Pressable>
  );
}

// Red ticker-tape bulletin bar.
export function Bulletin({ text, calm }) {
  return (
    <View style={[s.bulletin, calm && { backgroundColor: C.steel }]}>
      <Text style={s.bulletinTag}>{calm ? 'ALL CLEAR' : 'BULLETIN'}</Text>
      <Text style={s.bulletinText} numberOfLines={2}>
        {text}
      </Text>
    </View>
  );
}

// Analog temperature gauge: -10°F..110°F across a half circle.
const MIN = -10;
const MAX = 110;
const polar = (deg, r) => {
  const a = (deg * Math.PI) / 180;
  return [150 + r * Math.cos(a), 150 - r * Math.sin(a)];
};
const angleFor = (t) => 180 - (Math.min(Math.max(t, MIN), MAX) - MIN) / (MAX - MIN) * 180;
const arc = (fromT, toT, r) => {
  const [x1, y1] = polar(angleFor(fromT), r);
  const [x2, y2] = polar(angleFor(toT), r);
  return `M ${x1} ${y1} A ${r} ${r} 0 0 1 ${x2} ${y2}`;
};

export function Gauge({ temp }) {
  const [nx, ny] = polar(angleFor(temp ?? MIN), 108);
  const ticks = [0, 20, 40, 60, 80, 100];
  return (
    <Svg width="100%" height={150} viewBox="0 0 300 168" accessibilityLabel={`Temperature gauge, ${temp} degrees`}>
      <Path d={arc(MIN, MAX, 120)} fill="none" stroke={C.tan} strokeWidth={18} strokeLinecap="round" />
      <Path d={arc(MIN, 32, 120)} fill="none" stroke={C.cold} strokeWidth={18} strokeLinecap="round" />
      <Path d={arc(85, MAX, 120)} fill="none" stroke={C.red} strokeWidth={18} strokeLinecap="round" />
      <G>
        {ticks.map((t) => {
          const [x1, y1] = polar(angleFor(t), 112);
          const [x2, y2] = polar(angleFor(t), 124);
          const [lx, ly] = polar(angleFor(t), 94);
          return (
            <G key={t}>
              <Line x1={x1} y1={y1} x2={x2} y2={y2} stroke={C.ink} strokeWidth={2.5} strokeLinecap="round" />
              <SvgText x={lx} y={ly + 4} fontSize={12} fill={C.muted} textAnchor="middle" fontFamily={F.mono}>
                {t}
              </SvgText>
            </G>
          );
        })}
      </G>
      <Line x1={150} y1={150} x2={nx} y2={ny} stroke={C.red} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={150} cy={150} r={13} fill={C.brass} stroke={C.ink} strokeWidth={2} />
    </Svg>
  );
}

export function RadioLogo({ size = 120 }) {
  return (
    <Svg width={size} height={size * 0.58} viewBox="0 0 120 70">
      <Path d="M 10 62 A 50 50 0 0 1 110 62" fill="none" stroke={C.brass} strokeWidth={6} strokeLinecap="round" />
      <Path d="M 26 62 A 34 34 0 0 1 94 62" fill="none" stroke={C.gold} strokeWidth={3} strokeDasharray="4 6" />
      <Line x1={60} y1={62} x2={84} y2={24} stroke={C.red} strokeWidth={4} strokeLinecap="round" />
      <Circle cx={60} cy={62} r={7} fill={C.brass} />
    </Svg>
  );
}

export const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.walnut },
  pad: { paddingHorizontal: 14, paddingBottom: 14, gap: 12 },
  dial: { backgroundColor: C.cream, borderWidth: 4, borderColor: C.brass, borderRadius: 22, padding: 14 },
  readout: {
    flex: 1,
    backgroundColor: C.bakelite,
    borderWidth: 2,
    borderColor: C.brass,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
  },
  readoutLabel: { fontFamily: F.label, fontSize: 12, letterSpacing: 2, color: C.label },
  readoutValue: { fontFamily: F.monoBold, fontSize: 22, color: C.amber },
  titleBox: { paddingHorizontal: 6, paddingTop: 6 },
  title: { fontFamily: F.display, fontSize: 26, letterSpacing: 1, color: C.gold },
  subtitle: { fontFamily: F.label, fontSize: 15, letterSpacing: 3, color: C.label, textTransform: 'uppercase' },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 },
  btnPrimary: { backgroundColor: C.red },
  btnPrimaryText: { fontFamily: F.display, fontSize: 17, letterSpacing: 2, color: C.paper },
  btnSecondary: { backgroundColor: C.bakelite, borderWidth: 2, borderColor: C.brass },
  btnSecondaryText: { fontFamily: F.display, fontSize: 16, letterSpacing: 1, color: C.cream },
  btnGold: { backgroundColor: C.gold, borderWidth: 2, borderColor: C.ink, minHeight: 44 },
  btnGoldText: { fontFamily: F.labelBold, fontSize: 15, color: C.ink },
  toggle: { width: 64, height: 40, borderRadius: 20, borderWidth: 2, borderColor: C.ink, padding: 3, justifyContent: 'center' },
  toggleOn: { backgroundColor: C.ink, alignItems: 'flex-end' },
  toggleOff: { backgroundColor: C.tan, alignItems: 'flex-start' },
  knob: { width: 30, height: 30, borderRadius: 15 },
  bulletin: {
    backgroundColor: C.red,
    borderRadius: 10,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: C.cream,
    paddingVertical: 8,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  bulletinTag: { fontFamily: F.display, fontSize: 14, color: C.cream, letterSpacing: 1 },
  bulletinText: { flex: 1, fontFamily: F.mono, fontSize: 13, color: C.paper },
  sectionLabel: { fontFamily: F.label, fontSize: 13, letterSpacing: 3, color: C.muted },
  input: {
    fontFamily: F.mono,
    fontSize: 17,
    padding: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: C.ink,
    backgroundColor: C.field,
    color: C.ink,
  },
  rowDivider: { borderBottomWidth: 1, borderStyle: 'dashed', borderColor: C.rule },
});
