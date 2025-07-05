// App.js

// Dependencies (install via npm/yarn):
// expo install expo-notifications @react-native-async-storage/async-storage react-native-localize expo-font
// npm install react-native-paper react-native-animatable lottie-react-native react-native-google-mobile-ads

import { useFonts } from 'expo-font';
import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  StyleSheet,
  ActivityIndicator,
  StatusBar,
  Platform,
  ImageBackground,
} from 'react-native';
import * as RNLocalize from 'react-native-localize';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import LottieView from 'lottie-react-native';
import * as Animatable from 'react-native-animatable';
import {
  Provider as PaperProvider,
  Card,
  Paragraph,
  Button,
  DefaultTheme,
  configureFonts,
} from 'react-native-paper';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import { BannerAd, BannerAdSize, TestIds } from 'react-native-google-mobile-ads';
import { SafeAreaView } from 'react-native-safe-area-context';

// Background image
const BACKGROUND = require('./assets/background.png');
// Lottie animation
import pageTurn from './assets/pageTurn.json';

// ── language detection & localization ──
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

// configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: false,
    shouldSetBadge: false,
  }),
});

// ── CUSTOM FONT CONFIG FOR PAPER ──
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

export default function App() {
  // state & refs
  const [verse, setVerse] = useState({ text: '', reference: '' });
  const [loading, setLoading] = useState(true);
  const [stage, setStage] = useState('loading'); // 'loading'→'open'→'turn'→'display'
  const turnAnim = useRef(null);

  // load custom font (hook #5)
  const [fontsLoaded] = useFonts({
    Merriweather: require('./assets/fonts/Merriweather.ttf'),
  });

  // ad unit id (constant)
  const bannerId = __DEV__
    ? TestIds.BANNER
    : Platform.select({
      ios: 'ca-app-pub-6187514198107367/4665015573',
      android: 'ca-app-pub-6187514198107367/2038852234',
      default: TestIds.BANNER,
    });

  // tracking permission on iOS (hook #6)
  useEffect(() => {
    if (Platform.OS === 'ios') requestTrackingPermissionsAsync();
  }, []);

  // request notifications & create Android channel (hook #7)
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

  // fetch + schedule on mount (hook #8)
  useEffect(() => {
    (async () => {
      await fetchVerse();
      await scheduleIfNeeded();
      setStage('open');
    })();
  }, []);

  // don't render UI until fonts are ready (all hooks have been called)
  if (!fontsLoaded) {
    return null;
  }

  // fetch a random verse
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

  // schedule a one-time 10 AM notification if app not opened today
  async function scheduleIfNeeded() {
    const today = new Date().toISOString().split('T')[0];
    const lastOpen = await AsyncStorage.getItem(LAST_OPEN_KEY);
    if (lastOpen !== today) {
      let triggerDate = new Date();
      triggerDate.setHours(10, 0, 0, 0);
      if (new Date() >= triggerDate) {
        triggerDate.setDate(triggerDate.getDate() + 1);
      }
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

  // user taps button → refresh + immediate notification
  async function handleRefresh() {
    setStage('open');
    await fetchVerse();
    await scheduleIfNeeded();
  }

  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar barStyle="dark-content" backgroundColor="#6C63FF" />
        <ImageBackground source={BACKGROUND} style={styles.background} resizeMode="cover">
          <View style={styles.overlay}>
            {/* pinned button */}
            <Button
              mode="contained"
              onPress={handleRefresh}
              disabled={loading}
              style={styles.refreshBtn}
              contentStyle={{ paddingVertical: 6 }}
            >
              {BUTTON_LABEL}
            </Button>

            {/* Bible open + page-turn */}
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

            {/* verse card */}
            {stage === 'display' && (
              <Animatable.View animation="zoomIn" duration={500} style={styles.cardWrapper}>
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
          </View>
          <View style={{ marginBottom: 40}}><BannerAd unitId={bannerId} size={BannerAdSize.ADAPTIVE_BANNER} /></View>
        </ImageBackground>
      </PaperProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.6)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  lottie: {
    width: 300,
    height: 300,
  },
  cardWrapper: {
    width: '80%',
    alignItems: 'center',
  },
  card: {
    borderRadius: 16,
    padding: 12,
    width: '100%',
  },
  text: {
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: 'Merriweather',
    fontWeight: 700
  },
  reference: {
    fontSize: 14,
    textAlign: 'right',
    fontStyle: 'italic',
    fontFamily: 'Merriweather',
  },
  refreshBtn: {
    position: 'absolute',
    top: 60,
  },
});
