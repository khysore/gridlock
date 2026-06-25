import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  Alert,
  StatusBar,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, Polyline, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import { useKeepAwake } from 'expo-keep-awake';
import { getDistance } from '../utils/geoUtils';
import {
  announce,
  stopSpeech,
  generateAnnouncement,
} from '../services/AnnouncementService';
import COLORS from '../theme/colors';

const DEFAULT_REGION = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 5,
  longitudeDelta: 5,
};

export default function RideScreen({ navigation, route: navRoute }) {
  // Prevent the screen from sleeping during a ride
  useKeepAwake();

  const rideRoute = navRoute.params.route;

  const [announcedIds, setAnnouncedIds] = useState(new Set());
  const [lastAnnouncementText, setLastAnnouncementText] = useState('');
  const [locationReady, setLocationReady] = useState(false);
  const [userLocation, setUserLocation] = useState(null);
  const [isFollowing, setIsFollowing] = useState(true);

  // Use a ref for announcedIds so the location callback always has the latest value
  const announcedIdsRef = useRef(new Set());
  const locationSubscriptionRef = useRef(null);
  const mapRef = useRef(null);
  const isFollowingRef = useRef(true);   // ref copy so callbacks read current value
  const lastHeadingRef = useRef(null);   // for heading smoothing
  const recenterTimerRef = useRef(null); // auto-recentre after pan

  useEffect(() => {
    startTracking();
    return () => {
      stopTracking();
      stopSpeech();
      if (recenterTimerRef.current) clearTimeout(recenterTimerRef.current);
    };
  }, []);

  const startTracking = async () => {
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert(
        'Location Required',
        'GridLock needs location access to announce blocker positions. Please enable it in Settings.',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
      return;
    }

    locationSubscriptionRef.current = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 2000,     // at most every 2 seconds
        distanceInterval: 5,    // or every 5 metres moved
      },
      onLocationUpdate
    );
    setLocationReady(true);

    // Announce ride start so the rider can confirm audio is working
    const n = rideRoute.blockerPoints.length;
    const startText = `Ride started. ${n} blocker point${n !== 1 ? 's' : ''} loaded.`;
    announce(startText);
    setLastAnnouncementText(startText);
  };

  const stopTracking = () => {
    if (locationSubscriptionRef.current) {
      locationSubscriptionRef.current.remove();
      locationSubscriptionRef.current = null;
    }
  };

  // Format metres to a rider-friendly distance string (feet / miles)
  const formatDistance = (metres) => {
    const feet = metres * 3.28084;
    if (feet < 1000) return `${Math.round(feet)} ft`;
    return `${(feet / 5280).toFixed(1)} mi`;
  };

  // Move the camera so the rider appears in the lower-third of the screen,
  // showing more road ahead. Offset center ~150m forward in the direction of travel.
  const getCameraCenter = (latitude, longitude, bearingDeg) => {
    const OFFSET_METRES = 150;
    const R = 6371000;
    const bearingRad = (bearingDeg * Math.PI) / 180;
    const latRad = (latitude * Math.PI) / 180;
    const newLatRad =
      Math.asin(
        Math.sin(latRad) * Math.cos(OFFSET_METRES / R) +
        Math.cos(latRad) * Math.sin(OFFSET_METRES / R) * Math.cos(bearingRad)
      );
    const newLonRad =
      ((longitude * Math.PI) / 180) +
      Math.atan2(
        Math.sin(bearingRad) * Math.sin(OFFSET_METRES / R) * Math.cos(latRad),
        Math.cos(OFFSET_METRES / R) - Math.sin(latRad) * Math.sin(newLatRad)
      );
    return {
      latitude: (newLatRad * 180) / Math.PI,
      longitude: (newLonRad * 180) / Math.PI,
    };
  };

  const onLocationUpdate = async (location) => {
    const { latitude, longitude, heading, speed } = location.coords;

    setUserLocation({ latitude, longitude });

    // Follow the rider unless they manually panned the map or simulation is running
    if (isFollowingRef.current && !simulationRef.current) {
      // Smooth heading: only update bearing if it changed by more than 5 degrees
      const rawBearing = heading != null && heading >= 0 ? heading : (lastHeadingRef.current ?? 0);
      const prev = lastHeadingRef.current;
      const smoothBearing =
        prev == null || Math.abs(rawBearing - prev) > 5
          ? rawBearing
          : prev;
      lastHeadingRef.current = smoothBearing;

      // Offset center ahead of the rider so they appear in the lower third
      const center = getCameraCenter(latitude, longitude, smoothBearing);

      mapRef.current?.animateCamera(
        { center, heading: smoothBearing, zoom: 17, pitch: 0 },
        { duration: 400 }
      );
    }

    // Speed-adaptive trigger: aim for ~12 seconds of warning, capped at 250m (~820ft)
    // expo-location returns speed in m/s; negative means unavailable
    const speedMps = Math.max(0, speed ?? 0);
    const dynamicMetres = Math.min(speedMps * 12, 250);

    // Check every un-announced blocker point for proximity
    for (const point of rideRoute.blockerPoints) {
      if (announcedIdsRef.current.has(point.id)) continue;

      const dist = getDistance(
        latitude,
        longitude,
        point.latitude,
        point.longitude
      );

      // Use the larger of: speed-based lookahead OR the point's stored minimum radius
      const storedMetres = (point.triggerRadius ?? 75) * 0.3048;
      const effectiveTrigger = Math.max(storedMetres, dynamicMetres);

      if (dist <= effectiveTrigger) {
        const text = generateAnnouncement(point, dist);
        await announce(text);
        setLastAnnouncementText(text);
        announcedIdsRef.current.add(point.id);
        // Spread into a new Set so React re-renders the markers
        setAnnouncedIds(new Set(announcedIdsRef.current));
      }
    }
  };

  const [simulating, setSimulating] = useState(false);
  const simulationRef = useRef(false);

  const handleSimulate = async () => {
    const remaining = rideRoute.blockerPoints.filter(
      (p) => !announcedIdsRef.current.has(p.id)
    );
    if (remaining.length === 0) {
      Alert.alert('Simulation Done', 'All points have already been announced.');
      return;
    }
    setSimulating(true);
    simulationRef.current = true;

    for (const point of remaining) {
      if (!simulationRef.current) break;

      // Pan map to this point
      mapRef.current?.animateToRegion(
        {
          latitude: point.latitude,
          longitude: point.longitude,
          latitudeDelta: 0.005,
          longitudeDelta: 0.005,
        },
        600
      );

      const text = generateAnnouncement(point);
      await announce(text); // waits for speech to fully finish
      setLastAnnouncementText(text);
      announcedIdsRef.current.add(point.id);
      setAnnouncedIds(new Set(announcedIdsRef.current));

      // Brief pause between points
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    simulationRef.current = false;
    setSimulating(false);
  };

  const handleStopSimulation = () => {
    simulationRef.current = false;
    setSimulating(false);
  };

  const handleRecenter = () => {
    if (recenterTimerRef.current) {
      clearTimeout(recenterTimerRef.current);
      recenterTimerRef.current = null;
    }
    isFollowingRef.current = true;
    setIsFollowing(true);
    if (userLocation) {
      const bearing = lastHeadingRef.current ?? 0;
      const center = getCameraCenter(userLocation.latitude, userLocation.longitude, bearing);
      mapRef.current?.animateCamera(
        { center, heading: bearing, zoom: 17, pitch: 0 },
        { duration: 600 }
      );
    }
  };

  const handleMapRegionChangeComplete = (_region, isGesture) => {
    // Only pause following when the user intentionally dragged (not programmatic)
    if (isGesture && isGesture.isGesture && isFollowingRef.current) {
      isFollowingRef.current = false;
      setIsFollowing(false);
      // Auto-recentre after 8 seconds if the rider doesn't manually tap recenter
      if (recenterTimerRef.current) clearTimeout(recenterTimerRef.current);
      recenterTimerRef.current = setTimeout(handleRecenter, 8000);
    }
  };

  const handleRepeat = () => {
    if (lastAnnouncementText) {
      announce(lastAnnouncementText); // async, fire-and-forget is fine here
    } else {
      Alert.alert(
        'Nothing to Repeat',
        'No announcement has been made yet on this ride.'
      );
    }
  };

  const handleStop = () => {
    Alert.alert('Stop Ride', 'Are you sure you want to end this ride?', [
      { text: 'Keep Riding', style: 'cancel' },
      {
        text: 'Stop Ride',
        style: 'destructive',
        onPress: () => {
          stopTracking();
          stopSpeech();
          navigation.goBack();
        },
      },
    ]);
  };

  const getInitialRegion = () => {
    if (rideRoute.blockerPoints.length > 0) {
      return {
        latitude: rideRoute.blockerPoints[0].latitude,
        longitude: rideRoute.blockerPoints[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };
    }
    return DEFAULT_REGION;
  };

  const announcedCount = announcedIds.size;
  const totalCount = rideRoute.blockerPoints.length;

  // First unannounced point in route order — the current navigation target
  const nextPoint = rideRoute.blockerPoints.find((p) => !announcedIds.has(p.id));
  const nextDist =
    nextPoint && userLocation
      ? getDistance(userLocation.latitude, userLocation.longitude, nextPoint.latitude, nextPoint.longitude)
      : null;

  return (
    <View style={styles.container}>
      <StatusBar
        barStyle="light-content"
        backgroundColor="transparent"
        translucent
      />

      {/* Full-screen map */}
      <MapView
        ref={mapRef}
        style={StyleSheet.absoluteFillObject}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={getInitialRegion()}
        onRegionChangeComplete={handleMapRegionChangeComplete}
        showsUserLocation
        showsMyLocationButton={false}
        showsCompass
        showsTraffic
      >
        {/* Route line connecting all blocker points in order */}
        {rideRoute.blockerPoints.length > 1 && (
          <Polyline
            coordinates={rideRoute.blockerPoints.map((p) => ({
              latitude: p.latitude,
              longitude: p.longitude,
            }))}
            strokeColor="rgba(66,133,244,0.75)"
            strokeWidth={4}
            lineDashPattern={[12, 6]}
          />
        )}

        {rideRoute.blockerPoints.map((point, index) => {
          const done = announcedIds.has(point.id);
          const isNext = nextPoint && point.id === nextPoint.id;
          // Next point = blue, announced = green, other pending = orange
          const pinColor = done ? COLORS.success : isNext ? '#2196F3' : COLORS.warning;
          return (
            <Marker
              key={point.id}
              coordinate={{
                latitude: point.latitude,
                longitude: point.longitude,
              }}
              title={`${index + 1}. ${point.name}`}
              description={`${point.blockersNeeded} blocker${
                point.blockersNeeded !== 1 ? 's' : ''
              }${
                point.positionDescription
                  ? ` · ${point.positionDescription}`
                  : ''
              }`}
              pinColor={pinColor}
            />
          );
        })}
      </MapView>

      {/* ── TOP BAR ── */}
      <SafeAreaView edges={['top']} style={styles.topBarWrapper}>
        <View style={styles.topBar}>
          <View style={styles.topBarLeft}>
            <Text style={styles.routeTitle} numberOfLines={1}>
              {rideRoute.name}
            </Text>
            <Text style={styles.progressText}>
              {announcedCount} / {totalCount} announced
            </Text>
          </View>
          <View style={styles.legendRow}>
            <View style={[styles.legendDot, { backgroundColor: '#2196F3' }]} />
            <Text style={styles.legendLabel}>Next</Text>
            <View style={[styles.legendDot, { backgroundColor: COLORS.warning }]} />
            <Text style={styles.legendLabel}>Ahead</Text>
            <View style={[styles.legendDot, { backgroundColor: COLORS.success }]} />
            <Text style={styles.legendLabel}>Done</Text>
          </View>
        </View>
      </SafeAreaView>

      {/* ── RECENTER BUTTON (shown when user panned away) ── */}
      {!isFollowing && (
        <TouchableOpacity
          style={styles.recenterBtn}
          onPress={handleRecenter}
          accessibilityLabel="Recenter map on my location"
        >
          <Text style={styles.recenterIcon}>📍</Text>
          <Text style={styles.recenterLabel}>Recenter</Text>
        </TouchableOpacity>
      )}

      {/* ── NAVIGATION INFO CARD ── */}
      <View style={styles.infoCard}>
        {/* Next stop row */}
        <View style={styles.nextStopRow}>
          <View style={[styles.nextDot, nextPoint ? styles.nextDotActive : styles.nextDotDone]} />
          <View style={styles.nextStopInfo}>
            <Text style={styles.nextStopLabel}>
              {nextPoint ? 'NEXT STOP' : '✓ ROUTE COMPLETE'}
            </Text>
            {nextPoint && (
              <Text style={styles.nextStopName} numberOfLines={1}>
                {nextPoint.name}
                {nextPoint.positionDescription ? `  ·  ${nextPoint.positionDescription}` : ''}
              </Text>
            )}
          </View>
          {nextDist != null && (
            <Text style={styles.nextStopDist}>{formatDistance(nextDist)}</Text>
          )}
        </View>

        {/* Divider */}
        <View style={styles.infoCardDivider} />

        {/* Last announcement / status */}
        {lastAnnouncementText ? (
          <>
            <Text style={styles.announcementLabel}>LAST ANNOUNCEMENT</Text>
            <Text style={styles.announcementText}>{lastAnnouncementText}</Text>
          </>
        ) : (
          <>
            <Text style={styles.announcementLabel}>
              {locationReady ? 'RIDE IN PROGRESS' : 'ACQUIRING GPS…'}
            </Text>
            <Text style={styles.announcementText}>
              {locationReady
                ? 'Announcements fire automatically at each intersection'
                : 'Please wait while GPS is acquired'}
            </Text>
          </>
        )}
      </View>

      {/* ── BOTTOM CONTROLS ── */}
      <SafeAreaView edges={['bottom']} style={styles.bottomBar}>
        <TouchableOpacity
          style={[styles.ctrlBtn, styles.repeatBtn]}
          onPress={handleRepeat}
          accessibilityLabel="Repeat last announcement"
        >
          <Text style={styles.ctrlBtnIcon}>🔁</Text>
          <Text style={styles.ctrlBtnLabel}>Repeat</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, simulating ? styles.simActiveBtn : styles.simBtn]}
          onPress={simulating ? handleStopSimulation : handleSimulate}
          accessibilityLabel="Simulate ride"
        >
          <Text style={styles.ctrlBtnIcon}>{simulating ? '⏹' : '⚡'}</Text>
          <Text style={styles.ctrlBtnLabel}>{simulating ? 'Stop Sim' : 'Simulate'}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[styles.ctrlBtn, styles.stopBtn]}
          onPress={handleStop}
          accessibilityLabel="Stop ride"
        >
          <Text style={styles.ctrlBtnIcon}>■</Text>
          <Text style={styles.ctrlBtnLabel}>Stop Ride</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },

  /* Top bar */
  topBarWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    backgroundColor: COLORS.overlay,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topBarLeft: {
    flex: 1,
    marginRight: 12,
  },
  routeTitle: {
    color: COLORS.white,
    fontSize: 17,
    fontWeight: 'bold',
  },
  progressText: {
    color: 'rgba(255,255,255,0.75)',
    fontSize: 13,
    marginTop: 1,
  },
  legendRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginLeft: 6,
  },
  legendLabel: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 11,
  },

  /* Recenter button */
  recenterBtn: {
    position: 'absolute',
    right: 16,
    bottom: 200,
    backgroundColor: 'rgba(10,10,30,0.92)',
    borderRadius: 24,
    paddingHorizontal: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: '#2196F3',
  },
  recenterIcon: {
    fontSize: 16,
  },
  recenterLabel: {
    color: '#4fc3f7',
    fontSize: 13,
    fontWeight: '700',
  },

  /* Navigation info card (next stop + last announcement) */
  infoCard: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 90,
    backgroundColor: 'rgba(10,10,30,0.92)',
    marginHorizontal: 12,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(66,133,244,0.35)',
  },
  nextStopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 2,
  },
  nextDot: {
    width: 12,
    height: 12,
    borderRadius: 6,
    flexShrink: 0,
  },
  nextDotActive: {
    backgroundColor: '#2196F3',
  },
  nextDotDone: {
    backgroundColor: COLORS.success,
  },
  nextStopInfo: {
    flex: 1,
  },
  nextStopLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.1,
  },
  nextStopName: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '700',
    marginTop: 1,
  },
  nextStopDist: {
    color: '#4fc3f7',
    fontSize: 17,
    fontWeight: 'bold',
    flexShrink: 0,
  },
  infoCardDivider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 10,
  },
  announcementLabel: {
    color: COLORS.accent,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.2,
    marginBottom: 4,
  },
  announcementText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400',
  },

  /* Bottom controls */
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    backgroundColor: COLORS.overlay,
    paddingHorizontal: 16,
    paddingTop: 10,
    gap: 12,
  },
  ctrlBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 10,
    gap: 8,
  },
  repeatBtn: {
    backgroundColor: COLORS.primaryLight,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  simBtn: {
    backgroundColor: '#5c35a8',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
  },
  simActiveBtn: {
    backgroundColor: '#8a5cf6',
    borderWidth: 1.5,
    borderColor: '#fff',
  },
  stopBtn: {
    backgroundColor: COLORS.danger,
  },
  ctrlBtnIcon: {
    fontSize: 18,
  },
  ctrlBtnLabel: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: 'bold',
  },
});
