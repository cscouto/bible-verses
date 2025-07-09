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
import {
  getTrackingPermissionsAsync,
  requestTrackingPermissionsAsync,
} from 'expo-tracking-transparency';
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
  const [attStatus, setAttStatus] = useState('undetermined'); // 'undetermined' | 'granted' | 'denied' | 'restricted'
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
  /* 1) REQUEST APP-TRACKING-TRANSPARENCY IMMEDIATELY                      */
  /*    (No InteractionManager wrapper → cannot be skipped by iOS)        */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      if (Platform.OS !== 'ios') {
        setAttStatus('granted'); // Android, Web, etc.
        return;
      }

      const { status } = await getTrackingPermissionsAsync();
      if (status === 'undetermined') {
        const { status: afterPrompt } = await requestTrackingPermissionsAsync();
        setAttStatus(afterPrompt);
      } else {
        setAttStatus(status); // 'granted' | 'denied' | 'restricted'
      }
    })();
  }, []);

  /* -------------------------------------------------------------------- */
  /* 2) INITIALISE ADMOB ONLY AFTER ATT RESULT IS KNOWN                    */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    if (attStatus !== 'undetermined') {
      mobileAds().initialize(); // Safe: runs once after ATT resolved
    }
  }, [attStatus]);

  /* -------------------------------------------------------------------- */
  /* 3) NOTIFICATION PERMISSIONS & ANDROID CHANNEL                         */
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
  /* 4) FETCH FIRST VERSE + SCHEDULE DAILY NOTIF                           */
  /* -------------------------------------------------------------------- */
  useEffect(() => {
    (async () => {
      await fetchVerse();
      await scheduleIfNeeded();
      setStage('open');
    })();
  }, [TRANSLATION_ID]);

  /* -------------------------------------------------------------------- */
  /* 5) KEEP SPLASH UNTIL FONTS LOADED                                     */
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

  async function scheduleIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    const lastOpen = await AsyncStorage.getItem(LAST_OPEN_KEY);

    if (lastOpen !== today) {
      let triggerDate = new Date();
      triggerDate.setHours(10, 0, 0, 0);
      if (new Date() >= triggerDate) triggerDate.setDate(triggerDate.getDate() + 1);

      await Notifications.cancelAllScheduledNotificationsAsync();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: NOTIF_TITLE,
          body: verse.text || NOTIF_BODY,
          data: { reference: verse.reference },
        },
        trigger: { type: 'date', date: triggerDate, channelId: 'default' },
      });
    }
    await AsyncStorage.setItem(LAST_OPEN_KEY, today);
  }

  async function handleRefresh() {
    setStage('open');
    await fetchVerse();
    await scheduleIfNeeded();
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
                        <Paragraph style={styles.text}>
                          &ldquo;{verse.text}&rdquo;
                        </Paragraph>
                        {verse.reference && (
                          <Paragraph style={styles.reference}>
                            {verse.reference}
                          </Paragraph>
                        )}
                      </>
                    )}
                  </Card.Content>
                </Card>
              </Animatable.View>
            )}
          </SafeAreaView>

          {/* ----------- Ad Banner (renders ONLY after ATT status decided) ----------- */}
          {attStatus !== 'undetermined' && showBanner && (
            <View style={{ marginBottom: Platform.OS === 'ios' ? 0 : 40 }}>
              <BannerAd
                unitId={bannerId}
                size={BannerAdSize.ADAPTIVE_BANNER}
                onAdLoaded={() => setShowBanner(true)}                      // ad came back → show
                onAdFailedToLoad={err => {                                  // 👈 hide on failure
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
