import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import * as Location from 'expo-location';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useFonts } from 'expo-font';
import { Righteous_400Regular } from '@expo-google-fonts/righteous';
import {
  BarlowCondensed_500Medium,
  BarlowCondensed_600SemiBold,
  BarlowCondensed_700Bold,
} from '@expo-google-fonts/barlow-condensed';
import { CourierPrime_400Regular, CourierPrime_700Bold } from '@expo-google-fonts/courier-prime';

import * as B4A from './src/back4app';
import { deviceName, getExpoPushToken } from './src/notifications';
import { dayName, describe, getForecast, getOfficialAlerts, hourLabel, searchCities } from './src/weather';
import { Bulletin, Button, C, Dial, F, Gauge, RadioLogo, Readout, Title, Toggle, s } from './src/ui';

const TABS = [
  { key: 'now', label: 'NOW' },
  { key: 'week', label: '7-DAY' },
  { key: 'stations', label: 'STATIONS' },
  { key: 'alerts', label: 'ALERTS' },
];

export default function App() {
  const [fontsLoaded] = useFonts({
    Righteous_400Regular,
    BarlowCondensed_500Medium,
    BarlowCondensed_600SemiBold,
    BarlowCondensed_700Bold,
    CourierPrime_400Regular,
    CourierPrime_700Bold,
  });
  const [booting, setBooting] = useState(true);
  const [user, setUser] = useState(null);
  const [tab, setTab] = useState('now');
  const [stations, setStations] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [wx, setWx] = useState({}); // objectId -> { forecast, official, error }
  const [push, setPush] = useState({ token: null, error: null });
  const [inbox, setInbox] = useState([]); // notifications received on this phone
  const [openNote, setOpenNote] = useState(null); // full notification shown in a popup

  // Keep every notification this phone receives, so the full text can be read in the app
  // (iPhone banners cut long messages short). Tapping a notification opens it.
  useEffect(() => {
    AsyncStorage.getItem(INBOX_KEY)
      .then((raw) => raw && setInbox(JSON.parse(raw)))
      .catch(() => {});
    const save = (n) => {
      const note = toNote(n);
      setInbox((list) => {
        const next = [note, ...list.filter((x) => x.id !== note.id)].slice(0, 30);
        AsyncStorage.setItem(INBOX_KEY, JSON.stringify(next)).catch(() => {});
        return next;
      });
      return note;
    };
    const open = (response) => {
      const note = save(response.notification);
      setOpenNote(note);
      setTab('alerts');
    };
    const subs = [];
    try {
      subs.push(Notifications.addNotificationReceivedListener(save));
      subs.push(Notifications.addNotificationResponseReceivedListener(open));
      Notifications.getLastNotificationResponseAsync()
        .then((r) => r && open(r))
        .catch(() => {});
    } catch {
      // notifications unavailable on this platform (e.g. web)
    }
    return () => subs.forEach((sub) => sub.remove());
  }, []);

  const registerPush = useCallback(async () => {
    try {
      const token = await getExpoPushToken();
      await B4A.registerPushDevice(token, Platform.OS, deviceName());
      setPush({ token, error: null });
    } catch (e) {
      setPush({ token: null, error: e.message });
    }
  }, []);

  const loadWeather = useCallback(async (station) => {
    try {
      const [forecast, official] = await Promise.all([getForecast(station), getOfficialAlerts(station)]);
      setWx((w) => ({ ...w, [station.objectId]: { forecast, official } }));
    } catch (e) {
      setWx((w) => ({ ...w, [station.objectId]: { error: e.message } }));
    }
  }, []);

  const loadStations = useCallback(async () => {
    const list = await B4A.listLocations();
    setStations(list);
    setSelectedId((id) => (list.some((l) => l.objectId === id) ? id : list[0]?.objectId ?? null));
    list.forEach(loadWeather);
    return list;
  }, [loadWeather]);

  const onSignedIn = useCallback(
    async (u) => {
      setUser(u);
      registerPush();
      const list = await loadStations().catch(() => []);
      if (!list.length) setTab('stations');
    },
    [loadStations, registerPush],
  );

  useEffect(() => {
    B4A.restoreUser()
      .then((u) => u && onSignedIn(u))
      .catch(() => {})
      .finally(() => setBooting(false));
  }, [onSignedIn]);

  const signOut = async () => {
    if (push.token) await B4A.unregisterPushDevice(push.token).catch(() => {});
    await B4A.logOut().catch(() => {});
    setUser(null);
    setStations([]);
    setWx({});
    setPush({ token: null, error: null });
    setTab('now');
  };

  if (!fontsLoaded || booting) {
    return (
      <View style={[s.screen, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={C.brass} size="large" />
      </View>
    );
  }

  const selected = stations.find((st) => st.objectId === selectedId);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.screen} edges={['top', 'left', 'right']}>
        {!user ? (
          <SignOnScreen onSignedIn={onSignedIn} />
        ) : (
          <>
            <View style={{ flex: 1 }}>
              {tab === 'now' && (
                <NowScreen
                  station={selected}
                  data={selected && wx[selected.objectId]}
                  onRefresh={() => selected && loadWeather(selected)}
                  onAdd={() => setTab('stations')}
                />
              )}
              {tab === 'week' && <WeekScreen station={selected} data={selected && wx[selected.objectId]} />}
              {tab === 'stations' && (
                <StationsScreen
                  stations={stations}
                  wx={wx}
                  selectedId={selectedId}
                  onSelect={(id) => {
                    setSelectedId(id);
                    setTab('now');
                  }}
                  onChanged={loadStations}
                />
              )}
              {tab === 'alerts' && (
                <AlertsScreen
                  user={user}
                  setUser={setUser}
                  push={push}
                  onRetryPush={registerPush}
                  onSignOut={signOut}
                  inbox={inbox}
                  onOpenNote={setOpenNote}
                />
              )}
            </View>
            <SafeAreaView edges={['bottom']} style={{ backgroundColor: C.walnut }}>
              <View style={nav.bar}>
                {TABS.map((t) => (
                  <Pressable
                    key={t.key}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === t.key }}
                    onPress={() => setTab(t.key)}
                    style={[nav.tab, tab === t.key && nav.active]}
                  >
                    <Text style={[nav.text, tab === t.key && nav.activeText]}>{t.label}</Text>
                  </Pressable>
                ))}
              </View>
            </SafeAreaView>
          </>
        )}
        <NoteModal note={openNote} onClose={() => setOpenNote(null)} />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const INBOX_KEY = 'wx.inbox.v1';

function toNote(n) {
  const c = n.request.content;
  return {
    id: n.request.identifier,
    title: c.title || '',
    subtitle: c.subtitle || '',
    body: c.body || c.data?.message || '',
    date: n.date || Date.now(),
  };
}

// Full notification text in a ticker-tape popup.
function NoteModal({ note, onClose }) {
  return (
    <Modal visible={Boolean(note)} transparent animationType="fade" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(28,23,20,0.75)', justifyContent: 'center', padding: 20 }}>
        {note && (
          <Dial style={{ gap: 8 }}>
            <Text style={s.sectionLabel}>EMERGENCY BROADCAST</Text>
            <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink }}>{note.title}</Text>
            {note.subtitle ? <Text style={{ fontFamily: F.labelBold, fontSize: 16, color: C.muted }}>{note.subtitle}</Text> : null}
            <Text style={{ fontFamily: F.mono, fontSize: 16, lineHeight: 22, color: C.ink }}>{note.body}</Text>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{new Date(note.date).toLocaleString()}</Text>
            <Button label="CLOSE" variant="secondary" onPress={onClose} style={{ marginTop: 6 }} />
          </Dial>
        )}
      </View>
    </Modal>
  );
}

// ---------------------------------------------------------------------------
// Sign on (login / sign up)

function SignOnScreen({ onSignedIn }) {
  const [mode, setMode] = useState('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!username.trim() || !password) return Alert.alert('Missing info', 'Enter a call sign and password.');
    setBusy(true);
    try {
      const u =
        mode === 'login'
          ? await B4A.logIn(username.trim(), password)
          : await B4A.signUp(username.trim(), password, email.trim());
      onSignedIn(u);
    } catch (e) {
      Alert.alert(mode === 'login' ? 'Sign on failed' : 'Sign up failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={[s.pad, { flexGrow: 1, justifyContent: 'center', paddingTop: 24 }]} keyboardShouldPersistTaps="handled">
      <View style={{ alignItems: 'center', gap: 6 }}>
        <RadioLogo />
        <Text style={{ fontFamily: F.display, fontSize: 38, letterSpacing: 3, color: C.gold }}>WX·RADIO</Text>
        <Text style={{ fontFamily: F.label, fontSize: 16, letterSpacing: 4, color: C.label }}>
          YOUR PERSONAL WEATHER STATION
        </Text>
      </View>
      {!B4A.isConfigured && (
        <Bulletin text="Back4App keys missing: copy .env.example to .env and restart with --clear." />
      )}
      <Dial style={{ gap: 10 }}>
        <View style={auth.segment}>
          {[
            ['login', 'SIGN ON'],
            ['signup', 'NEW LISTENER'],
          ].map(([k, label]) => (
            <Pressable key={k} onPress={() => setMode(k)} style={[auth.segBtn, mode === k && auth.segActive]}>
              <Text style={[auth.segText, mode === k && { color: C.cream }]}>{label}</Text>
            </Pressable>
          ))}
        </View>
        <Text style={s.sectionLabel}>CALL SIGN (USERNAME)</Text>
        <TextInput
          style={s.input}
          value={username}
          onChangeText={setUsername}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="your-name"
          placeholderTextColor={C.rule}
        />
        {mode === 'signup' && (
          <>
            <Text style={s.sectionLabel}>EMAIL (OPTIONAL)</Text>
            <TextInput
              style={s.input}
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              keyboardType="email-address"
              placeholder="you@example.com"
              placeholderTextColor={C.rule}
            />
          </>
        )}
        <Text style={s.sectionLabel}>PASSWORD</Text>
        <TextInput
          style={s.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          placeholder="••••••••"
          placeholderTextColor={C.rule}
          onSubmitEditing={submit}
        />
        <Button
          label={busy ? 'TUNING IN…' : mode === 'login' ? 'GO ON AIR' : 'CREATE ACCOUNT'}
          onPress={submit}
          disabled={busy}
          style={{ marginTop: 6 }}
        />
      </Dial>
      <Text style={{ textAlign: 'center', fontFamily: F.body, fontSize: 15, color: C.label }}>
        Sign on to save stations and get weather alerts on this phone.
      </Text>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// Now

function bulletinFor(data) {
  const official = data?.official?.[0];
  if (official) return { text: (official.headline || official.event).toUpperCase() };
  const hours = data?.forecast?.hourly?.slice(0, 12) || [];
  const wet = hours.reduce((best, h) => (h.rain > (best?.rain ?? -1) ? h : best), null);
  if (wet && wet.rain >= 60) {
    const i = hours.indexOf(wet);
    return { text: `RAIN LIKELY ${hourLabel(wet.time, i).toUpperCase()} — ${wet.rain}% CHANCE` };
  }
  return { text: 'NO BULLETINS FOR THIS STATION', calm: true };
}

function NowScreen({ station, data, onRefresh, onAdd }) {
  if (!station) {
    return (
      <View style={[s.pad, { flex: 1, justifyContent: 'center' }]}>
        <Title title="No station tuned" subtitle="Add a city to get started" />
        <Button label="ADD A STATION" onPress={onAdd} />
      </View>
    );
  }
  const f = data?.forecast;
  const today = f?.daily?.[0];
  const b = bulletinFor(data);
  return (
    <ScrollView
      contentContainerStyle={s.pad}
      refreshControl={<RefreshControl refreshing={false} onRefresh={onRefresh} tintColor={C.brass} />}
    >
      <View style={now.header}>
        <View>
          <Text style={{ fontFamily: F.display, fontSize: 22, letterSpacing: 2, color: C.gold }}>WX·RADIO</Text>
          <Text style={s.subtitle}>Now tuned to</Text>
        </View>
        <View style={now.onAir}>
          <View style={now.lamp} />
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.cream, letterSpacing: 1 }}>ON AIR</Text>
        </View>
      </View>

      <Dial style={{ alignItems: 'center', paddingBottom: 12 }}>
        <View style={now.cityRow}>
          <Text style={{ fontFamily: F.display, fontSize: 24, color: C.ink, flexShrink: 1 }} numberOfLines={1}>
            {station.name}
            {station.region ? `, ${station.region}` : ''}
          </Text>
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.muted }}>
            {Math.abs(station.latitude).toFixed(2)}°{station.latitude >= 0 ? 'N' : 'S'}
          </Text>
        </View>
        {data?.error ? (
          <Text style={{ fontFamily: F.mono, color: C.red, marginVertical: 30 }}>{data.error}</Text>
        ) : !f ? (
          <ActivityIndicator color={C.brass} style={{ marginVertical: 60 }} />
        ) : (
          <>
            <Gauge temp={f.current.temp} />
            <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginTop: -14 }}>
              <Text style={{ fontFamily: F.display, fontSize: 72, lineHeight: 78, color: C.ink }}>{f.current.temp}</Text>
              <Text style={{ fontFamily: F.display, fontSize: 28, color: C.ink, marginTop: 8 }}>°F</Text>
            </View>
            <Text style={{ fontFamily: F.label, fontSize: 19, letterSpacing: 2, color: C.muted, textAlign: 'center' }}>
              {describe(f.current.code).label.toUpperCase()} · H {today.high}° L {today.low}°
            </Text>
          </>
        )}
      </Dial>

      {f && (
        <>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Readout label="FEELS LIKE" value={`${f.current.feelsLike}°`} />
            <Readout label="HUMIDITY" value={`${f.current.humidity}%`} />
            <Readout label="WIND" value={`${f.current.wind} mph`} />
          </View>
          <Bulletin text={b.text} calm={b.calm} />
          <Dial style={{ borderWidth: 3, borderRadius: 16, padding: 10, gap: 6 }}>
            <Text style={s.sectionLabel}>TUNING BAND · NEXT HOURS</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ borderTopWidth: 2, borderColor: C.ink }}>
              {f.hourly.slice(0, 12).map((h, i) => (
                <View key={h.time} style={now.hour}>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{hourLabel(h.time, i).toUpperCase()}</Text>
                  <Text style={{ fontFamily: F.display, fontSize: 20, color: C.ink }}>{h.temp}°</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.steel }}>{h.rain}%</Text>
                </View>
              ))}
            </ScrollView>
          </Dial>
          {data.official?.length > 1 &&
            data.official.slice(1).map((a) => <Bulletin key={a.id} text={a.event.toUpperCase()} />)}
        </>
      )}
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------
// 7-day

function WeekScreen({ station, data }) {
  const f = data?.forecast;
  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Title
        title="The 7-Day Program"
        subtitle={station ? `${station.name}${station.region ? `, ${station.region}` : ''}` : 'No station tuned'}
      />
      {!f ? (
        <ActivityIndicator color={C.brass} style={{ marginTop: 40 }} />
      ) : (
        <>
          <Dial style={{ paddingVertical: 6 }}>
            {f.daily.map((d, i) => (
              <View key={d.date} style={[week.row, i < f.daily.length - 1 && s.rowDivider]}>
                <Text style={{ width: 62, fontFamily: F.display, fontSize: 19, color: C.ink }}>
                  {dayName(d.date, i).toUpperCase()}
                </Text>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontFamily: F.label, fontSize: 17, color: C.ink }}>{describe(d.code).label}</Text>
                  <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.steel }}>RAIN {d.rain}%</Text>
                </View>
                <Text style={{ width: 58, textAlign: 'right', fontFamily: F.mono, fontSize: 13, color: C.muted }}>
                  {d.gusts} mph
                </Text>
                <Text style={{ width: 44, textAlign: 'right', fontFamily: F.display, fontSize: 21, color: C.hot }}>
                  {d.high}°
                </Text>
                <Text style={{ width: 38, textAlign: 'right', fontFamily: F.display, fontSize: 17, color: C.steel }}>
                  {d.low}°
                </Text>
              </View>
            ))}
          </Dial>
          <View style={{ flexDirection: 'row', gap: 10 }}>
            <Readout label="SUNRISE / SUNSET" value={`${clock(f.daily[0].sunrise)} · ${clock(f.daily[0].sunset)}`} />
            <Readout label="UV INDEX" value={f.daily[0].uv != null ? `${Math.round(f.daily[0].uv)}` : '—'} />
          </View>
        </>
      )}
    </ScrollView>
  );
}

const clock = (iso) => {
  const h = Number(iso.slice(11, 13));
  return `${h % 12 || 12}:${iso.slice(14, 16)}${h < 12 ? 'A' : 'P'}`;
};

// ---------------------------------------------------------------------------
// Stations (saved cities)

function StationsScreen({ stations, wx, selectedId, onSelect, onChanged }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [busy, setBusy] = useState(false);

  const search = async () => {
    setBusy(true);
    try {
      const r = await searchCities(q);
      setResults(r);
      if (!r.length) Alert.alert('No signal', `No city found for "${q}".`);
    } catch (e) {
      Alert.alert('Search failed', e.message);
    } finally {
      setBusy(false);
    }
  };

  const add = async (city) => {
    try {
      const created = await B4A.addLocation(city);
      setResults([]);
      setQ('');
      await onChanged();
      onSelect(created.objectId);
    } catch (e) {
      Alert.alert('Could not save', e.message);
    }
  };

  const useMyLocation = async () => {
    setBusy(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('Location permission was denied.');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const [place] = await Location.reverseGeocodeAsync(pos.coords).catch(() => []);
      await add({
        name: place?.city || place?.subregion || 'My location',
        region: place?.region || '',
        country: place?.isoCountryCode || '',
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
      });
    } catch (e) {
      Alert.alert('Location', e.message);
    } finally {
      setBusy(false);
    }
  };

  const remove = (st) =>
    Alert.alert('Remove station?', st.name, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () => B4A.deleteLocation(st.objectId).then(onChanged).catch((e) => Alert.alert('Error', e.message)),
      },
    ]);

  return (
    <FlatList
      data={stations}
      keyExtractor={(st) => st.objectId}
      contentContainerStyle={s.pad}
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={{ gap: 12 }}>
          <Title title="Tune a Station" subtitle="Your saved cities" />
          <Dial style={{ gap: 10 }}>
            <Text style={s.sectionLabel}>SEARCH THE DIAL</Text>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TextInput
                style={[s.input, { flex: 1 }]}
                value={q}
                onChangeText={setQ}
                placeholder="City name…"
                placeholderTextColor={C.rule}
                returnKeyType="search"
                onSubmitEditing={search}
                autoCorrect={false}
              />
              <Button label="TUNE" onPress={search} disabled={busy} style={{ minWidth: 84 }} />
            </View>
            {results.length > 0 && (
              <View style={{ borderTopWidth: 2, borderColor: C.ink }}>
                {results.map((r, i) => (
                  <View key={r.id} style={[st.result, i < results.length - 1 && s.rowDivider]}>
                    <Text style={{ flex: 1, fontFamily: F.label, fontSize: 18, color: C.ink }}>
                      {r.name}{' '}
                      <Text style={{ fontFamily: F.body, color: C.muted }}>
                        · {[r.region, r.country].filter(Boolean).join(', ')}
                      </Text>
                    </Text>
                    <Button label="+ ADD" variant="gold" onPress={() => add(r)} />
                  </View>
                ))}
              </View>
            )}
          </Dial>
          <Button label="USE MY LOCATION" variant="secondary" onPress={useMyLocation} disabled={busy} />
          {busy && <ActivityIndicator color={C.brass} />}
          <Text style={[s.sectionLabel, { color: C.label }]}>PRESETS</Text>
        </View>
      }
      renderItem={({ item, index }) => {
        const f = wx[item.objectId]?.forecast;
        const active = item.objectId === selectedId;
        return (
          <Pressable
            onPress={() => onSelect(item.objectId)}
            onLongPress={() => remove(item)}
            style={[st.preset, active && { borderColor: C.amber, borderWidth: 3 }]}
          >
            <View style={st.presetNum}>
              <Text style={{ fontFamily: F.display, fontSize: 18, color: C.bakelite }}>{index + 1}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.labelBold, fontSize: 19, color: C.cream }} numberOfLines={1}>
                {item.name}
                {item.region ? `, ${item.region}` : ''}
              </Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.label }}>
                {f ? describe(f.current.code).label.toUpperCase() : 'TUNING…'}
              </Text>
            </View>
            <Text style={{ fontFamily: F.display, fontSize: 26, color: C.amber }}>{f ? `${f.current.temp}°` : ''}</Text>
          </Pressable>
        );
      }}
      ListEmptyComponent={
        <Text style={{ fontFamily: F.body, fontSize: 16, color: C.label }}>No presets yet — search for a city above.</Text>
      }
      ListFooterComponent={
        stations.length ? (
          <Text style={{ fontFamily: F.body, fontSize: 14, color: C.label }}>
            Tap a preset to tune in. Long-press to remove it. Alerts watch every preset.
          </Text>
        ) : null
      }
      ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
    />
  );
}

// ---------------------------------------------------------------------------
// Alerts + account

// What to do about common Expo push receipt errors.
function receiptHelp(code) {
  switch (code) {
    case 'DeviceNotRegistered':
      return 'This phone is no longer registered. Sign off and sign back on to get a new push token.';
    case 'InvalidCredentials':
      return 'The Apple/Firebase push keys in EAS are missing or wrong. Re-run: npx eas-cli@latest credentials';
    case 'MessageTooBig':
      return 'The message is too long. Shorten it.';
    case 'MessageRateExceeded':
      return 'Too many notifications at once. Wait a minute and try again.';
    default:
      return 'Check that notifications are allowed for Expo Go in iPhone Settings → Notifications.';
  }
}

const SWITCHES = [
  ['enabled', 'All alerts', 'MASTER SWITCH'],
  ['rain', 'Rain', 'CHANCE ≥ 60% IN 12 HRS'],
  ['freeze', 'Freezing', 'LOW ≤ 32°F'],
  ['heat', 'Heat', 'HIGH ≥ 90°F'],
  ['wind', 'Wind', 'GUSTS ≥ 40 MPH'],
  ['official', 'Official warnings', 'NATIONAL WEATHER SERVICE'],
];

function AlertsScreen({ user, setUser, push, onRetryPush, onSignOut, inbox, onOpenNote }) {
  const [log, setLog] = useState(null);
  const [busy, setBusy] = useState(false);
  const prefs = user.alertPrefs;

  const loadLog = useCallback(() => {
    B4A.getNotificationHistory(15)
      .then(setLog)
      .catch(() => setLog([]));
  }, []);
  useEffect(loadLog, [loadLog]);

  const toggle = async (key, value) => {
    const next = { ...prefs, [key]: value };
    setUser({ ...user, alertPrefs: next });
    try {
      setUser(await B4A.saveAlertPrefs(next));
    } catch (e) {
      setUser({ ...user, alertPrefs: prefs });
      Alert.alert('Could not save', e.message);
    }
  };

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Broadcast failed', e.message);
    } finally {
      setBusy(false);
      loadLog();
    }
  };

  const checkNow = () =>
    run(async () => {
      const r = await B4A.checkMyWeatherAlerts(true);
      if (r.disabled) return Alert.alert('Alerts are off', 'Turn on the master switch first.');
      const found = r.found.filter((x) => x.title);
      Alert.alert(
        found.length ? `${found.length} alert${found.length > 1 ? 's' : ''} found` : 'All clear',
        found.length
          ? found.map((x) => `• ${x.title}`).join('\n') + `\n\nSent to ${r.sent} device(s).`
          : `Checked ${r.locations} station(s). No weather alerts right now.`,
      );
    });

  // Send a test alert, then ask the Expo Push Receipts API whether Apple/Google delivered it.
  const testBroadcast = () =>
    run(async () => {
      const r = await B4A.callFunction('sendTestWeatherAlert');
      if (!r.sent) throw new Error(r.failed?.join('\n') || 'Expo did not accept the notification.');
      await new Promise((ok) => setTimeout(ok, 5000));
      const rc = await B4A.getPushReceipts(r.notificationId).catch((e) => ({ receiptStatus: 'unknown', errors: [{ message: e.message }] }));
      if (rc.receiptStatus === 'delivered') {
        Alert.alert('Delivered ✓', 'Apple/Google accepted the test alert. Tap the notification to read it in full.');
      } else if (rc.receiptStatus === 'error') {
        Alert.alert('Delivery problem', rc.errors.map((e) => `${e.error}: ${e.message}`).join('\n') + `\n\n${receiptHelp(rc.errors[0]?.error)}`);
      } else {
        Alert.alert('Sent', 'Expo accepted it; Apple has not confirmed yet. It should arrive in a moment.');
      }
    });

  const rows = useMemo(() => SWITCHES.filter(([k]) => k === 'enabled' || prefs.enabled), [prefs.enabled]);

  return (
    <ScrollView contentContainerStyle={s.pad}>
      <Title title="Emergency Broadcast" subtitle="Push alerts from the station" />

      <Dial style={{ paddingVertical: 6 }}>
        {rows.map(([key, label, rule], i) => (
          <View key={key} style={[al.row, i < rows.length - 1 && s.rowDivider]}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontFamily: F.labelBold, fontSize: 18, color: C.ink }}>{label}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>{rule}</Text>
            </View>
            <Toggle value={Boolean(prefs[key])} onChange={(v) => toggle(key, v)} label={label} />
          </View>
        ))}
      </Dial>

      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button label="CHECK NOW" onPress={checkNow} disabled={busy} style={{ flex: 1 }} />
        <Button label="TEST ALERT" variant="secondary" onPress={testBroadcast} disabled={busy} style={{ flex: 1 }} />
      </View>
      {busy && <ActivityIndicator color={C.brass} />}

      <View style={al.tape}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 2, color: C.muted, textAlign: 'center' }}>
          — RECEIVED ON THIS PHONE —
        </Text>
        {inbox.length === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.muted }}>Nothing received yet. Try TEST ALERT.</Text>
        ) : (
          inbox.slice(0, 10).map((n) => (
            <Pressable
              key={n.id}
              onPress={() => onOpenNote(n)}
              style={{ borderBottomWidth: 1, borderStyle: 'dotted', borderColor: C.rule, paddingBottom: 6 }}
            >
              <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{n.title}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.ink }}>{n.body}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }}>{new Date(n.date).toLocaleString()} · TAP TO OPEN</Text>
            </Pressable>
          ))
        )}
      </View>

      <View style={al.tape}>
        <Text style={{ fontFamily: F.mono, fontSize: 12, letterSpacing: 2, color: C.muted, textAlign: 'center' }}>
          — BROADCAST LOG —
        </Text>
        {log === null ? (
          <ActivityIndicator color={C.muted} />
        ) : log.length === 0 ? (
          <Text style={{ fontFamily: F.mono, fontSize: 13, color: C.muted }}>No broadcasts yet.</Text>
        ) : (
          log.map((l) => (
            <View key={l.id} style={{ borderBottomWidth: 1, borderStyle: 'dotted', borderColor: C.rule, paddingBottom: 6 }}>
              <Text style={{ fontFamily: F.monoBold, fontSize: 14, color: C.ink }}>{(l.title || l.message).toUpperCase()}</Text>
              <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.muted }}>
                {new Date(l.createdAt.iso || l.createdAt).toLocaleString()} · {l.status.toUpperCase()}
                {l.receiptStatus && l.receiptStatus !== 'none' ? ` · APPLE/GOOGLE: ${l.receiptStatus.toUpperCase()}` : ''}
              </Text>
            </View>
          ))
        )}
      </View>

      <Dial style={{ gap: 6 }}>
        <Text style={s.sectionLabel}>THIS RECEIVER</Text>
        <Text style={{ fontFamily: F.labelBold, fontSize: 18, color: C.ink }}>Signed on as {user.username}</Text>
        {push.token ? (
          <Text style={{ fontFamily: F.mono, fontSize: 11, color: C.muted }} selectable>
            Push ready: {push.token}
          </Text>
        ) : (
          <>
            <Text style={{ fontFamily: F.mono, fontSize: 12, color: C.red }}>{push.error || 'Registering for push…'}</Text>
            <Button label="RETRY PUSH SETUP" variant="gold" onPress={onRetryPush} />
          </>
        )}
        <Button label="SIGN OFF" variant="secondary" onPress={onSignOut} style={{ marginTop: 6 }} />
      </Dial>
    </ScrollView>
  );
}

// ---------------------------------------------------------------------------

const nav = {
  bar: { flexDirection: 'row', gap: 8, backgroundColor: C.bakelite, borderRadius: 18, padding: 8, marginHorizontal: 14, marginBottom: 8 },
  tab: { flex: 1, minHeight: 44, borderRadius: 12, backgroundColor: C.walnut, alignItems: 'center', justifyContent: 'center' },
  active: { backgroundColor: C.brass },
  text: { fontFamily: F.label, fontSize: 14, letterSpacing: 1, color: '#e9d8b4' },
  activeText: { fontFamily: F.labelBold, color: C.bakelite },
};
const now = {
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 6, paddingTop: 6 },
  onAir: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: C.bakelite,
    borderWidth: 2,
    borderColor: C.brass,
    borderRadius: 999,
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  lamp: { width: 10, height: 10, borderRadius: 5, backgroundColor: C.amber, shadowColor: C.amber, shadowOpacity: 1, shadowRadius: 6 },
  cityRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', alignSelf: 'stretch', gap: 8 },
  hour: { width: 52, alignItems: 'center', paddingTop: 6, gap: 2 },
};
const week = { row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 6 } };
const st = {
  result: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  preset: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: C.bakelite,
    borderWidth: 2,
    borderColor: C.brass,
    borderRadius: 16,
    padding: 10,
  },
  presetNum: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.brass, alignItems: 'center', justifyContent: 'center' },
};
const al = {
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9 },
  tape: { backgroundColor: C.paper, borderRadius: 6, padding: 12, gap: 8 },
};
const auth = {
  segment: { flexDirection: 'row', backgroundColor: C.tan, borderRadius: 12, padding: 4, gap: 4 },
  segBtn: { flex: 1, minHeight: 44, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  segActive: { backgroundColor: C.ink },
  segText: { fontFamily: F.labelBold, fontSize: 16, letterSpacing: 2, color: C.ink },
};
