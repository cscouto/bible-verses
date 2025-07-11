// App.js
//
// Dependencies (install via npm/yarn):
//   expo install expo-notifications @react-native-async-storage/async-storage react-native-localize expo-font expo-tracking-transparency
//   npm   install react-native-paper react-native-animatable lottie-react-native react-native-google-mobile-ads
//
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  ImageBackground,
  Platform,
  StatusBar,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as RNLocalize from 'react-native-localize';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import LottieView from 'lottie-react-native';
import * as Animatable from 'react-native-animatable';
import {
  Button,
  Card,
  DefaultTheme,
  Paragraph,
  Provider as PaperProvider,
  configureFonts,
} from 'react-native-paper';
import mobileAds, {
  BannerAd,
  BannerAdSize,
  TestIds,
} from 'react-native-google-mobile-ads';
import { useFonts } from 'expo-font';

/* ---------- STATIC ASSETS ---------- */
const BACKGROUND = require('./assets/background.png');
import pageTurn from './assets/pageTurn.json';

/* ---------- LOCALISATION ---------- */
const deviceLang = RNLocalize.getLocales()[0]?.languageCode || 'en';
const isPt = deviceLang.startsWith('pt');
const TRANSLATION_ID = isPt ? 'almeida' : 'web';
const API_URL = `https://bible-api.com/data/${TRANSLATION_ID}/random`;
const BUTTON_LABEL = isPt ? 'Novo Versículo' : 'New Verse';
const NOTIF_TITLE = isPt ? 'Versículo Diário' : 'Daily Verse';
const NOTIF_BODY = isPt
  ? 'Toque para abrir o app e ler um versículo!'
  : 'Tap to open the app and read a verse!';
const LAST_OPEN_KEY = '@bible:last_open_date';

/* ---------- NOTIFICATION HANDLER ---------- */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

/* ---------- PAPER FONT CONFIG ---------- */
const fontConfig = {
  default: {
    regular: { fontFamily: 'Merriweather', fontWeight: '400' },
    medium: { fontFamily: 'Merriweather', fontWeight: '500' },
    light: { fontFamily: 'Merriweather', fontWeight: '300' },
    thin: { fontFamily: 'Merriweather', fontWeight: '200' },
  },
};
const theme = {
  ...DefaultTheme,
  fonts: configureFonts(fontConfig),
};

/* ======================================================================== */
/*                               MAIN APP                                   */
/* ======================================================================== */

export default function App() {
  /* ------------ STATE ------------ */
  const [verse, setVerse] = useState({ text: '', reference: '' });
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('loading'); // loading | open | turn | display
  const turnAnim = useRef(null);
  const [showBanner, setShowBanner] = useState(true);

  /* ------------ FONTS ------------ */
  const [fontsLoaded] = useFonts({
    Merriweather: require('./assets/fonts/Merriweather.ttf'),
  });

  /* ------------ BANNER ID ------------ */
  const bannerId = __DEV__
    ? TestIds.BANNER
    : Platform.select({
      ios: 'ca-app-pub-6187514198107367/4665015573',
      android: 'ca-app-pub-6187514198107367/2038852234',
      default: TestIds.BANNER,
    });

  /* -------------------------------------------------------------------- */
  /* 1) NOTIFICATION PERMISSIONS & ANDROID CHANNEL                         */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status !== 'granted') {
        console.warn('Notification permissions not granted!');
      }
      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'Default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
    })();
  }, []);

  /* -------------------------------------------------------------------- */
  /* 2) FETCH FIRST VERSE + SCHEDULE DAILY NOTIF                           */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      await fetchVerse();
      await scheduleDailyNotification();
      setStage('open');
    })();
    // Re‑run when locale changes so the notification text stays localized
  }, [TRANSLATION_ID]);

  /* -------------------------------------------------------------------- */
  /* 3) KEEP SPLASH UNTIL FONTS LOADED                                     */
  /* -------------------------------------------------------------------- */
  if (!fontsLoaded) {
    return null;
  }

  /* ============================ HELPERS =============================== */

  async function fetchVerse() {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      const json = await res.json();
      const rv = json.random_verse;
      setVerse({
        text: (rv.text ?? '').trim(),
        reference: `${rv.book} ${rv.chapter}:${rv.verse}`,
      });
    } catch (e) {
      console.error('Fetch error:', e);
      setVerse({ text: 'Erro ao obter versículo.', reference: '' });
    }
    setLoading(false);
  }

  /**
   * Schedule a **repeating** daily notification at 10:00 AM.
   * We cancel any existing schedule first to avoid duplicates.
   * The schedule persists even if the user does not reopen the app.
   */
  async function scheduleDailyNotification() {
    const today = new Date().toISOString().split('T')[0];
    const lastOpen = await AsyncStorage.getItem(LAST_OPEN_KEY);

    if (lastOpen !== today) {
      // Clear previous schedules so we don't stack multiple identical ones
      await Notifications.cancelAllScheduledNotificationsAsync();

      await Notifications.scheduleNotificationAsync({
        content: {
          title: NOTIF_TITLE,
          body: verse.text || NOTIF_BODY,
          data: { reference: verse.reference },
        },
        trigger: {
          hour: 10,
          minute: 0,
          repeats: true,
          // iOS ignores channelId, but it is required for Android when using channels
          channelId: 'default',
        },
      });

      await AsyncStorage.setItem(LAST_OPEN_KEY, today);
    }
  }

  async function handleRefresh() {
    setStage('open');
    await fetchVerse();
    await scheduleDailyNotification();
  }

  /* ============================== UI ================================== */
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar barStyle="dark-content" backgroundColor="#6C63FF" />
        <ImageBackground
          source={BACKGROUND}
          style={styles.background}
          resizeMode="cover"
        >
          <SafeAreaView style={styles.overlay}>
            {/* ----------- New Verse Button ----------- */}
            <Button
              mode="contained"
              onPress={handleRefresh}
              disabled={loading}
              style={styles.refreshBtn}
              contentStyle={{ paddingVertical: 6 }}
            >
              {BUTTON_LABEL}
            </Button>

            {/* ----------- Page-turn animation ----------- */}
            {(stage === 'open' || stage === 'turn') && (
              <LottieView
                ref={turnAnim}
                source={pageTurn}
                autoPlay
                loop={false}
                onAnimationFinish={() => setStage('display')}
                style={styles.lottie}
              />
            )}

            {/* ----------- Verse Card ----------- */}
            {stage === 'display' && (
              <Animatable.View
                animation="zoomIn"
                duration={500}
                style={styles.cardWrapper}
              >
                <Card style={styles.card} elevation={4}>
                  <Card.Content>
                    {loading ? (
                      <ActivityIndicator size="large" />
                    ) : (
                      <>
                        <Paragraph style={styles.text}>&ldquo;{verse.text}&rdquo;</Paragraph>
                        {verse.reference && (
                          <Paragraph style={styles.reference}>{verse.reference}</Paragraph>
                        )}
                      </>
                    )}
                  </Card.Content>
                </Card>
              </Animatable.View>
            )}
          </SafeAreaView>

          {/* ----------- Ad Banner (renders ONLY after ATT status decided) ----------- */}
          {showBanner && (
            <View style={{ marginBottom: Platform.OS === 'ios' ? 0 : 40 }}>
              <BannerAd
                unitId={bannerId}
                size={BannerAdSize.ADAPTIVE_BANNER}
                onAdLoaded={() => setShowBanner(true)} // ad came back → show
                onAdFailedToLoad={err => {
                  console.warn('Banner failed:', err);
                  setShowBanner(false);
                }}
              />
            </View>
          )}
        </ImageBackground>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

/* ============================ STYLES ================================ */
const styles = StyleSheet.create({
  background: { flex: 1 },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: { width: 300, height: 300 },
  cardWrapper: { width: '80%', alignItems: 'center' },
  card: { borderRadius: 16, padding: 12, width: '100%' },
  text: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'Merriweather',
    fontWeight: '700',
  },
  reference: {
    fontSize: 14,
    textAlign: 'right',
    fontStyle: 'italic',
    fontFamily: 'Merriweather',
  },
  refreshBtn: { position: 'absolute', top: 60 },
});
