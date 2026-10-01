import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { getArchetypeCards, getArchetypes, getCardsByName, isExtraDeck, searchCards } from './src/api';
import { STAPLE_NAMES, analyzeDeck, count, maxCopies, optimizeDeck } from './src/optimizer';
import {
  deleteDeck,
  getUser,
  isCloudEnabled,
  listDecks,
  logIn,
  logOut,
  registerPushDevice,
  restoreUser,
  saveDeck,
  sendPushNotification,
  signUp,
  unregisterPushDevice,
} from './src/back4app';
import { deviceName, getExpoPushToken } from './src/notifications';

const TABS = ['Optimize', 'Deck', 'Search', 'Saved', 'Account'];
const emptyDeck = { objectId: null, name: 'My Deck', archetype: '', main: [], extra: [] };

export default function App() {
  const [tab, setTab] = useState('Optimize');
  const [deck, setDeck] = useState(emptyDeck);
  const [user, setUser] = useState(null);
  const [push, setPush] = useState({ token: null, error: null });

  // Get this device's Expo Push Token and save it to Back4App (PushDevice class).
  const registerPush = useCallback(async () => {
    try {
      const token = await getExpoPushToken();
      await registerPushDevice(token, Platform.OS, deviceName());
      setPush({ token, error: null });
    } catch (e) {
      setPush({ token: null, error: e.message });
    }
  }, []);

  useEffect(() => {
    if (!isCloudEnabled) return;
    restoreUser()
      .then((u) => {
        setUser(u);
        if (u) registerPush();
      })
      .catch(() => {});
  }, [registerPush]);

  const addCard = useCallback((card, delta = 1) => {
    setDeck((d) => {
      const key = isExtraDeck(card) ? 'extra' : 'main';
      const list = d[key];
      const existing = list.find((e) => e.card.id === card.id);
      const next = existing
        ? list
            .map((e) => (e.card.id === card.id ? { ...e, count: e.count + delta } : e))
            .filter((e) => e.count > 0)
        : delta > 0
          ? [...list, { card, count: 1 }]
          : list;
      return { ...d, [key]: next };
    });
  }, []);

  return (
    <SafeAreaProvider>
      <SafeAreaView style={styles.root} edges={['top', 'left', 'right']}>
        <StatusBar style="light" />
        <Text style={styles.title}>Yu-Gi-Oh! Deck Optimizer</Text>
        <View style={styles.body}>
          {tab === 'Optimize' && (
            <OptimizeScreen
              onBuilt={(built) => {
                setDeck(built);
                setTab('Deck');
              }}
            />
          )}
          {tab === 'Deck' && <DeckScreen deck={deck} setDeck={setDeck} addCard={addCard} />}
          {tab === 'Search' && <SearchScreen deck={deck} addCard={addCard} />}
          {tab === 'Saved' && (
            <SavedScreen
              onOpen={(d) => {
                setDeck(d);
                setTab('Deck');
              }}
            />
          )}
          {tab === 'Account' && (
            <AccountScreen
              user={user}
              push={push}
              onLogin={(u) => {
                setUser(u);
                registerPush();
              }}
              onLogout={async () => {
                if (push.token) await unregisterPushDevice(push.token).catch(() => {});
                await logOut().catch(() => {});
                setUser(null);
                setPush({ token: null, error: null });
              }}
              onRetryPush={registerPush}
            />
          )}
        </View>
        <SafeAreaView edges={['bottom']} style={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t} style={styles.tab} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabActive]}>{t}</Text>
            </Pressable>
          ))}
        </SafeAreaView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

// ---------------------------------------------------------------------------

function OptimizeScreen({ onBuilt }) {
  const [archetype, setArchetype] = useState('');
  const [all, setAll] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    getArchetypes().then(setAll).catch(() => {});
  }, []);

  const suggestions = useMemo(() => {
    const q = archetype.trim().toLowerCase();
    if (!q) return [];
    return all.filter((a) => a.toLowerCase().includes(q)).slice(0, 8);
  }, [archetype, all]);

  const build = async (name = archetype) => {
    if (!name.trim()) return;
    setLoading(true);
    try {
      const [pool, staples] = await Promise.all([getArchetypeCards(name), getCardsByName(STAPLE_NAMES)]);
      if (!pool.length) {
        Alert.alert('No cards found', `Couldn't find an archetype called "${name}".`);
        return;
      }
      const { main, extra } = optimizeDeck(pool, staples, name);
      onBuilt({ ...emptyDeck, name: `${name} (optimized)`, archetype: name, main, extra });
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.flex}>
      <Text style={styles.p}>
        Pick an archetype and the optimizer builds a legal 40-card deck: it maxes out starters and
        extenders, follows the current TCG banlist, adds the best hand traps, then tunes the ratio to
        maximize your odds of opening a playable hand.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="Archetype (e.g. Snake-Eye, Branded, Blue-Eyes)"
        placeholderTextColor="#888"
        value={archetype}
        onChangeText={setArchetype}
        onSubmitEditing={() => build()}
        autoCorrect={false}
      />
      {suggestions.map((s) => (
        <Pressable
          key={s}
          style={styles.suggestion}
          onPress={() => {
            setArchetype(s);
            build(s);
          }}
        >
          <Text style={styles.text}>{s}</Text>
        </Pressable>
      ))}
      <Pressable style={styles.button} onPress={() => build()} disabled={loading}>
        {loading ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Optimize Deck</Text>}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

function DeckScreen({ deck, setDeck, addCard }) {
  const stats = useMemo(() => analyzeDeck(deck), [deck]);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const objectId = await saveDeck(deck);
      setDeck((d) => ({ ...d, objectId }));
      Alert.alert('Saved', getUser() ? 'Deck saved to Back4App.' : 'Deck saved on this device.');
    } catch (e) {
      Alert.alert('Save failed', e.message);
    } finally {
      setSaving(false);
    }
  };

  const rows = [
    { header: `Main Deck (${stats.mainSize})` },
    ...deck.main.map((e) => ({ entry: e })),
    { header: `Extra Deck (${stats.extraSize})` },
    ...deck.extra.map((e) => ({ entry: e })),
  ];

  return (
    <View style={styles.flex}>
      <TextInput
        style={styles.input}
        value={deck.name}
        onChangeText={(name) => setDeck((d) => ({ ...d, name }))}
      />
      <View style={styles.statsBox}>
        <Text style={styles.text}>
          {stats.monsters} Monsters · {stats.spells} Spells · {stats.traps} Traps
        </Text>
        <Text style={styles.text}>
          {stats.starters} starters · {stats.handTraps} hand traps ·{' '}
          <Text style={styles.highlight}>{(stats.starterOdds * 100).toFixed(1)}%</Text> to open a starter
        </Text>
        {stats.warnings.map((w) => (
          <Text key={w} style={styles.warning}>
            ⚠ {w}
          </Text>
        ))}
      </View>
      <FlatList
        data={rows}
        keyExtractor={(r, i) => (r.header ? `h${i}` : String(r.entry.card.id))}
        renderItem={({ item }) =>
          item.header ? (
            <Text style={styles.section}>{item.header}</Text>
          ) : (
            <CardRow card={item.entry.card}>
              <Pressable style={styles.small} onPress={() => addCard(item.entry.card, -1)}>
                <Text style={styles.buttonText}>−</Text>
              </Pressable>
              <Text style={styles.count}>{item.entry.count}</Text>
              <Pressable
                style={styles.small}
                disabled={item.entry.count >= maxCopies(item.entry.card)}
                onPress={() => addCard(item.entry.card, 1)}
              >
                <Text style={styles.buttonText}>+</Text>
              </Pressable>
            </CardRow>
          )
        }
        ListEmptyComponent={<Text style={styles.p}>Empty deck — use Optimize or Search.</Text>}
      />
      <Pressable style={styles.button} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Save Deck</Text>}
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

function SearchScreen({ deck, addCard }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      setResults(await searchCards(q));
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setLoading(false);
    }
  };

  const inDeck = (card) =>
    count([...deck.main, ...deck.extra].filter((e) => e.card.id === card.id));

  return (
    <View style={styles.flex}>
      <TextInput
        style={styles.input}
        placeholder="Search card name…"
        placeholderTextColor="#888"
        value={q}
        onChangeText={setQ}
        onSubmitEditing={run}
        returnKeyType="search"
        autoCorrect={false}
      />
      {loading && <ActivityIndicator color="#e0b341" style={{ margin: 12 }} />}
      <FlatList
        data={results}
        keyExtractor={(c) => String(c.id)}
        renderItem={({ item }) => {
          const n = inDeck(item);
          const max = maxCopies(item);
          return (
            <CardRow card={item}>
              <Text style={styles.count}>{n}</Text>
              <Pressable style={styles.small} disabled={n >= max} onPress={() => addCard(item, 1)}>
                <Text style={styles.buttonText}>{max === 0 ? '✕' : '+'}</Text>
              </Pressable>
            </CardRow>
          );
        }}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function SavedScreen({ onOpen }) {
  const [decks, setDecks] = useState(null);

  const load = useCallback(() => {
    listDecks()
      .then(setDecks)
      .catch((e) => {
        setDecks([]);
        Alert.alert('Could not load decks', e.message);
      });
  }, []);
  useEffect(load, [load]);

  const remove = (d) =>
    Alert.alert('Delete deck?', d.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteDeck(d.objectId).then(load) },
    ]);

  if (!decks) return <ActivityIndicator color="#e0b341" style={{ marginTop: 40 }} />;
  return (
    <View style={styles.flex}>
      <Text style={styles.p}>
        {getUser()
          ? 'Synced with Back4App.'
          : 'Saved on this device. Log in on the Account tab to sync with Back4App.'}
      </Text>
      <FlatList
        data={decks}
        keyExtractor={(d) => d.objectId}
        onRefresh={load}
        refreshing={false}
        renderItem={({ item }) => (
          <Pressable style={styles.deckRow} onPress={() => onOpen(item)} onLongPress={() => remove(item)}>
            <Text style={styles.cardName}>{item.name}</Text>
            <Text style={styles.sub}>
              {count(item.main)} main · {count(item.extra)} extra · long-press to delete
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={<Text style={styles.p}>No saved decks yet.</Text>}
      />
    </View>
  );
}

// ---------------------------------------------------------------------------

function AccountScreen({ user, push, onLogin, onLogout, onRetryPush }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn) => {
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      Alert.alert('Error', e.message);
    } finally {
      setBusy(false);
    }
  };

  if (!isCloudEnabled) {
    return (
      <Text style={styles.p}>
        Back4App isn't connected. Copy .env.example to .env, add your App ID and JavaScript Key, then
        restart Expo.
      </Text>
    );
  }

  if (!user) {
    const auth = (fn) => run(async () => onLogin(await fn(username.trim(), password)));
    return (
      <View style={styles.flex}>
        <Text style={styles.p}>Log in to sync decks and get push notifications.</Text>
        <TextInput
          style={styles.input}
          placeholder="Username"
          placeholderTextColor="#888"
          autoCapitalize="none"
          autoCorrect={false}
          value={username}
          onChangeText={setUsername}
        />
        <TextInput
          style={styles.input}
          placeholder="Password"
          placeholderTextColor="#888"
          secureTextEntry
          value={password}
          onChangeText={setPassword}
        />
        <Pressable style={styles.button} disabled={busy} onPress={() => auth(logIn)}>
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Log In</Text>}
        </Pressable>
        <Pressable style={[styles.button, styles.secondary]} disabled={busy} onPress={() => auth(signUp)}>
          <Text style={styles.buttonText}>Create Account</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Text style={styles.p}>
        Logged in as <Text style={styles.highlight}>{user.username}</Text>
      </Text>
      <View style={styles.statsBox}>
        <Text style={styles.cardName}>Push notifications</Text>
        {push.token ? (
          <Text style={styles.sub} selectable>
            Registered: {push.token}
          </Text>
        ) : (
          <Text style={styles.warning}>{push.error ?? 'Registering…'}</Text>
        )}
      </View>
      {push.token ? (
        <Pressable
          style={styles.button}
          disabled={busy}
          onPress={() =>
            run(async () => {
              const res = await sendPushNotification({
                token: push.token,
                title: 'Test notification',
                message: 'Back4App → Expo Push → your phone. It works!',
                data: { screen: 'Account' },
              });
              if (res.failed.length) throw new Error(res.failed.join('\n'));
            })
          }
        >
          {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.buttonText}>Send Test Notification</Text>}
        </Pressable>
      ) : (
        <Pressable style={styles.button} onPress={onRetryPush}>
          <Text style={styles.buttonText}>Retry Push Setup</Text>
        </Pressable>
      )}
      <Pressable style={[styles.button, styles.secondary]} disabled={busy} onPress={() => run(onLogout)}>
        <Text style={styles.buttonText}>Log Out</Text>
      </Pressable>
    </View>
  );
}

// ---------------------------------------------------------------------------

function CardRow({ card, children }) {
  return (
    <View style={styles.cardRow}>
      {card.image ? <Image source={{ uri: card.image }} style={styles.cardImg} /> : null}
      <View style={styles.flex}>
        <Text style={styles.cardName} numberOfLines={1}>
          {card.name}
        </Text>
        <Text style={styles.sub} numberOfLines={1}>
          {card.type}
          {card.banTcg ? ` · ${card.banTcg}` : ''}
        </Text>
      </View>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#14121f' },
  flex: { flex: 1 },
  body: { flex: 1, paddingHorizontal: 16 },
  title: { color: '#e0b341', fontSize: 22, fontWeight: '800', textAlign: 'center', marginVertical: 12 },
  p: { color: '#bbb', marginVertical: 8, lineHeight: 20 },
  text: { color: '#eee' },
  highlight: { color: '#7ee787', fontWeight: '700' },
  warning: { color: '#f0a35e', marginTop: 4 },
  input: {
    backgroundColor: '#24213a',
    color: '#fff',
    borderRadius: 10,
    padding: 12,
    marginVertical: 8,
    fontSize: 16,
  },
  suggestion: { padding: 10, borderBottomWidth: 1, borderColor: '#2c2945' },
  button: {
    backgroundColor: '#6b3fd4',
    borderRadius: 10,
    padding: 14,
    alignItems: 'center',
    marginVertical: 12,
  },
  secondary: { backgroundColor: '#3a3459', marginTop: 0 },
  buttonText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  statsBox: { backgroundColor: '#1d1a2e', borderRadius: 10, padding: 12, gap: 2 },
  section: { color: '#e0b341', fontWeight: '700', fontSize: 16, marginTop: 14, marginBottom: 4 },
  cardRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6, gap: 10 },
  cardImg: { width: 40, height: 58, borderRadius: 3 },
  cardName: { color: '#fff', fontWeight: '600' },
  sub: { color: '#999', fontSize: 12 },
  small: {
    backgroundColor: '#3a3459',
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  count: { color: '#fff', width: 20, textAlign: 'center', fontWeight: '700' },
  deckRow: { backgroundColor: '#1d1a2e', borderRadius: 10, padding: 14, marginVertical: 5 },
  tabBar: { flexDirection: 'row', backgroundColor: '#1d1a2e', borderTopWidth: 1, borderColor: '#2c2945' },
  tab: { flex: 1, alignItems: 'center', paddingVertical: 14 },
  tabText: { color: '#888', fontWeight: '600' },
  tabActive: { color: '#e0b341' },
});
