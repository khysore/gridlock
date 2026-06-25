import React, { useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import MapView, { Marker, PROVIDER_GOOGLE } from 'react-native-maps';
import * as Location from 'expo-location';
import * as Crypto from 'expo-crypto';
import { saveRoute } from '../services/StorageService';
import BlockerPointModal from '../components/BlockerPointModal';
import COLORS from '../theme/colors';

const DEFAULT_REGION = {
  latitude: 39.5,
  longitude: -98.35,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

export default function EditRouteScreen({ navigation, route: navRoute }) {
  const routeParam = navRoute.params.route;

  const [routeName, setRouteName] = useState(routeParam.name || 'New Route');
  const [blockerPoints, setBlockerPoints] = useState(
    routeParam.blockerPoints || []
  );
  const [mapRegion, setMapRegion] = useState(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingPoint, setEditingPoint] = useState(null);
  const [pendingCoordinate, setPendingCoordinate] = useState(null);
  const [suggestedName, setSuggestedName] = useState('');
  const mapRef = useRef(null);

  useEffect(() => {
    navigation.setOptions({ title: routeName || 'Edit Route' });
  }, [routeName, navigation]);

  useEffect(() => {
    initMapRegion();
  }, []);

  const initMapRegion = async () => {
    if (blockerPoints.length > 0) {
      setMapRegion({
        latitude: blockerPoints[0].latitude,
        longitude: blockerPoints[0].longitude,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      });
      return;
    }
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status === 'granted') {
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.Balanced,
      });
      setMapRegion({
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.03,
        longitudeDelta: 0.03,
      });
    } else {
      setMapRegion(DEFAULT_REGION);
    }
  };

  // Tap on blank map area → reverse geocode then open modal
  const handleMapPress = async (event) => {
    const coord = event.nativeEvent.coordinate;
    setPendingCoordinate(coord);
    setEditingPoint(null);
    setSuggestedName('');
    setModalVisible(true); // open immediately; name fills in async

    try {
      const { latitude: lat, longitude: lon } = coord;

      // Overpass: find all named roads within 40 m of the tap point
      const query = `[out:json];way(around:40,${lat},${lon})[highway][name];out tags;`;
      const resp = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: `data=${encodeURIComponent(query)}`,
      });
      const json = await resp.json();
      const roads = json?.elements ?? [];

      // Collect unique road names, closest first (order from API is proximity-based)
      const names = [];
      for (const el of roads) {
        const n = el.tags?.name;
        if (n && !names.includes(n)) names.push(n);
        if (names.length === 2) break;
      }

      if (names.length >= 2) {
        setSuggestedName(`${names[0]} & ${names[1]}`);
      } else if (names.length === 1) {
        setSuggestedName(names[0]);
      }
    } catch {
      // silent fallback — user types manually
    }
  };

  // Tap on existing marker → edit that point
  const handleMarkerPress = (point) => {
    setEditingPoint(point);
    setPendingCoordinate(null);
    setModalVisible(true);
  };

  const handleModalSave = (data) => {
    if (editingPoint) {
      setBlockerPoints((prev) =>
        prev.map((p) => (p.id === editingPoint.id ? { ...p, ...data } : p))
      );
    } else {
      setBlockerPoints((prev) => [
        ...prev,
        {
          id: Crypto.randomUUID(),
          latitude: pendingCoordinate.latitude,
          longitude: pendingCoordinate.longitude,
          ...data,
        },
      ]);
    }
    setModalVisible(false);
    setEditingPoint(null);
    setPendingCoordinate(null);
    setSuggestedName('');
  };

  const handleModalCancel = () => {
    setModalVisible(false);
    setEditingPoint(null);
    setPendingCoordinate(null);
    setSuggestedName('');
  };

  const handleDeletePoint = (pointId) => {
    Alert.alert('Remove Point', 'Remove this blocker point from the route?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: () =>
          setBlockerPoints((prev) => prev.filter((p) => p.id !== pointId)),
      },
    ]);
  };

  const handleSave = async () => {
    if (!routeName.trim()) {
      Alert.alert('Required', 'Please enter a route name.');
      return;
    }
    const updatedRoute = {
      ...routeParam,
      name: routeName.trim(),
      blockerPoints,
      updatedAt: new Date().toISOString(),
    };
    const ok = await saveRoute(updatedRoute);
    if (ok) {
      navigation.goBack();
    } else {
      Alert.alert('Error', 'Failed to save. Please try again.');
    }
  };

  const renderPointItem = ({ item, index }) => (
    <View style={styles.pointItem}>
      <View style={styles.pointBadge}>
        <Text style={styles.pointBadgeText}>{index + 1}</Text>
      </View>
      <View style={styles.pointInfo}>
        <Text style={styles.pointName} numberOfLines={1}>
          {item.name}
        </Text>
        <Text style={styles.pointMeta}>
          {item.blockersNeeded} blocker{item.blockersNeeded !== 1 ? 's' : ''}
          {item.positionDescription ? `  ·  ${item.positionDescription}` : ''}
        </Text>
      </View>
      <TouchableOpacity
        style={styles.pointActionBtn}
        onPress={() => handleMarkerPress(item)}
      >
        <Text style={styles.pointEditText}>Edit</Text>
      </TouchableOpacity>
      <TouchableOpacity
        style={[styles.pointActionBtn, styles.pointDeleteBtn]}
        onPress={() => handleDeletePoint(item.id)}
      >
        <Text style={styles.pointDeleteText}>✕</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Map fills the entire background */}
      {mapRegion && (
        <MapView
          ref={mapRef}
          style={StyleSheet.absoluteFillObject}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={mapRegion}
          onPress={handleMapPress}
          showsUserLocation
          showsMyLocationButton={false}
        >
          {blockerPoints.map((point, index) => (
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
              pinColor={COLORS.warning}
              onPress={() => handleMarkerPress(point)}
            />
          ))}
        </MapView>
      )}

      {/* Top overlay: route name + save */}
      <SafeAreaView edges={['top']} style={styles.topOverlay}>
        <View style={styles.topBar}>
          <TextInput
            style={styles.routeNameInput}
            value={routeName}
            onChangeText={setRouteName}
            placeholder="Route Name"
            placeholderTextColor="rgba(255,255,255,0.55)"
            returnKeyType="done"
          />
          <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
            <Text style={styles.saveBtnText}>Save</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.hintBanner}>
          <Text style={styles.hintText}>
            Tap anywhere on the map to add a blocker point
          </Text>
        </View>
      </SafeAreaView>

      {/* Bottom overlay: list of blocker points */}
      {blockerPoints.length > 0 && (
        <SafeAreaView edges={['bottom']} style={styles.bottomPanel}>
          <Text style={styles.bottomPanelTitle}>
            Blocker Points  ({blockerPoints.length})
          </Text>
          <FlatList
            data={blockerPoints}
            keyExtractor={(item) => item.id}
            renderItem={renderPointItem}
            style={styles.pointList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          />
        </SafeAreaView>
      )}

      {/* Add/edit point modal */}
      <BlockerPointModal
        visible={modalVisible}
        point={editingPoint ?? (suggestedName ? { name: suggestedName } : null)}
        onSave={handleModalSave}
        onCancel={handleModalCancel}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#ddd',
  },
  topOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.overlay,
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  routeNameInput: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: COLORS.white,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.4)',
    paddingVertical: 4,
  },
  saveBtn: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 8,
  },
  saveBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 15,
  },
  hintBanner: {
    backgroundColor: 'rgba(26,26,46,0.75)',
    paddingHorizontal: 14,
    paddingVertical: 6,
    alignItems: 'center',
  },
  hintText: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 13,
  },
  bottomPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: 260,
    paddingHorizontal: 16,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 8,
  },
  bottomPanelTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  pointList: {
    flexGrow: 0,
  },
  pointItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#eee',
    gap: 8,
  },
  pointBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: COLORS.warning,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pointBadgeText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 13,
  },
  pointInfo: {
    flex: 1,
  },
  pointName: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  pointMeta: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 1,
  },
  pointActionBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    backgroundColor: COLORS.background,
    borderWidth: 1,
    borderColor: '#ddd',
  },
  pointEditText: {
    fontSize: 12,
    color: COLORS.primary,
    fontWeight: '600',
  },
  pointDeleteBtn: {
    backgroundColor: '#fff0f0',
    borderColor: COLORS.danger,
  },
  pointDeleteText: {
    fontSize: 12,
    color: COLORS.danger,
    fontWeight: 'bold',
  },
});
