import React, { useState, useCallback } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import * as Crypto from 'expo-crypto';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import { getRoutes, deleteRoute, saveRoute } from '../services/StorageService';
import COLORS from '../theme/colors';

export default function HomeScreen({ navigation }) {
  const [routes, setRoutes] = useState([]);

  useFocusEffect(
    useCallback(() => {
      (async () => {
        const loaded = await getRoutes();
        setRoutes(loaded);
      })();
    }, [])
  );

  const handleNewRoute = () => {
    const newRoute = {
      id: Crypto.randomUUID(),
      name: 'New Route',
      description: '',
      blockerPoints: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    navigation.navigate('EditRoute', { route: newRoute });
  };

  const handleStartRide = (route) => {
    if (!route.blockerPoints || route.blockerPoints.length === 0) {
      Alert.alert(
        'No Blocker Points',
        'Add at least one blocker point to this route before starting a ride.'
      );
      return;
    }
    navigation.navigate('Ride', { route });
  };

  const handleDelete = (route) => {
    Alert.alert(
      'Delete Route',
      `Delete "${route.name}"? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteRoute(route.id);
            const updated = await getRoutes();
            setRoutes(updated);
          },
        },
      ]
    );
  };

  const handleShare = async (route) => {
    try {
      const isAvailable = await Sharing.isAvailableAsync();
      if (!isAvailable) {
        Alert.alert('Sharing Not Available', 'Sharing is not supported on this device.');
        return;
      }
      const json = JSON.stringify(route, null, 2);
      // Sanitise the filename
      const safeName = route.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
      const path = `${FileSystem.cacheDirectory}${safeName}.gridlock`;
      await FileSystem.writeAsStringAsync(path, json, { encoding: FileSystem.EncodingType.UTF8 });
      await Sharing.shareAsync(path, {
        mimeType: 'application/json',
        dialogTitle: `Share route: ${route.name}`,
        UTI: 'public.json',
      });
    } catch (e) {
      Alert.alert('Share Failed', 'Could not share this route.');
    }
  };

  const handleImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'public.json', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;

      const text = await FileSystem.readAsStringAsync(asset.uri, {
        encoding: FileSystem.EncodingType.UTF8,
      });

      let imported;
      try {
        imported = JSON.parse(text);
      } catch {
        Alert.alert('Invalid File', 'This file does not appear to be a valid GridLock route.');
        return;
      }

      // Validate minimum required fields
      if (!imported.name || !Array.isArray(imported.blockerPoints)) {
        Alert.alert('Invalid File', 'This file does not contain a recognisable GridLock route.');
        return;
      }

      // Assign a fresh ID so it doesn't collide with an existing route
      const fresh = {
        ...imported,
        id: Crypto.randomUUID(),
        importedAt: new Date().toISOString(),
      };

      const existing = await getRoutes();
      const duplicate = existing.find(
        (r) => r.name === fresh.name && r.blockerPoints.length === fresh.blockerPoints.length
      );

      if (duplicate) {
        Alert.alert(
          'Route Already Exists',
          `You already have a route called "${fresh.name}" with the same number of points. Import anyway?`,
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Import',
              onPress: async () => {
                await saveRoute(fresh);
                const updated = await getRoutes();
                setRoutes(updated);
                Alert.alert('Imported', `"${fresh.name}" has been added to your routes.`);
              },
            },
          ]
        );
        return;
      }

      await saveRoute(fresh);
      const updated = await getRoutes();
      setRoutes(updated);
      Alert.alert('Imported', `"${fresh.name}" has been added to your routes.`);
    } catch (e) {
      Alert.alert('Import Failed', 'Could not read the selected file.');
    }
  };

  const renderItem = ({ item }) => {
    const count = item.blockerPoints?.length ?? 0;
    return (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <Text style={styles.routeName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.pointCount}>
            {count} point{count !== 1 ? 's' : ''}
          </Text>
        </View>

        {!!item.description && (
          <Text style={styles.routeDesc} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.cardActions}>
          <TouchableOpacity
            style={[styles.actionBtn, styles.rideBtn]}
            onPress={() => handleStartRide(item)}
            accessibilityLabel={`Start ride on ${item.name}`}
          >
            <Text style={styles.rideBtnText}>▶  Start Ride</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.editBtn]}
            onPress={() => navigation.navigate('EditRoute', { route: item })}
            accessibilityLabel={`Edit ${item.name}`}
          >
            <Text style={styles.editBtnText}>Edit</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.shareBtn]}
            onPress={() => handleShare(item)}
            accessibilityLabel={`Share ${item.name}`}
          >
            <Text style={styles.shareBtnText}>⬆</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionBtn, styles.deleteBtn]}
            onPress={() => handleDelete(item)}
            accessibilityLabel={`Delete ${item.name}`}
          >
            <Text style={styles.deleteBtnText}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <FlatList
        data={routes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={
          routes.length === 0 ? styles.emptyContainer : styles.listContainer
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏍️</Text>
            <Text style={styles.emptyTitle}>No Routes Yet</Text>
            <Text style={styles.emptySubtitle}>
              Tap "New Route" to create a ride route and add the intersections
              where blockers are needed.
            </Text>
          </View>
        }
      />

      <TouchableOpacity style={styles.fab} onPress={handleNewRoute}>
        <Text style={styles.fabText}>+ New Route</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.importBtn} onPress={handleImport}>
        <Text style={styles.importBtnText}>⬇  Import Route</Text>
      </TouchableOpacity>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 100,
  },
  emptyContainer: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyState: {
    alignItems: 'center',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: 14,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  routeName: {
    fontSize: 18,
    fontWeight: 'bold',
    color: COLORS.text,
    flex: 1,
    marginRight: 8,
  },
  pointCount: {
    fontSize: 13,
    color: COLORS.textSecondary,
  },
  routeDesc: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 6,
    lineHeight: 20,
  },
  cardActions: {
    flexDirection: 'row',
    marginTop: 12,
    gap: 8,
  },
  actionBtn: {
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rideBtn: {
    backgroundColor: COLORS.primary,
    flex: 1,
  },
  rideBtnText: {
    color: COLORS.white,
    fontWeight: 'bold',
    fontSize: 14,
  },
  editBtn: {
    backgroundColor: COLORS.background,
    borderWidth: 1.5,
    borderColor: COLORS.primary,
    paddingHorizontal: 16,
  },
  editBtnText: {
    color: COLORS.primary,
    fontWeight: '600',
    fontSize: 14,
  },
  deleteBtn: {
    backgroundColor: '#fff0f0',
    borderWidth: 1.5,
    borderColor: COLORS.danger,
    paddingHorizontal: 12,
  },
  deleteBtnText: {
    color: COLORS.danger,
    fontWeight: 'bold',
    fontSize: 16,
  },
  shareBtn: {
    backgroundColor: '#f0f4ff',
    borderWidth: 1.5,
    borderColor: '#4a90d9',
    paddingHorizontal: 12,
  },
  shareBtnText: {
    color: '#4a90d9',
    fontWeight: 'bold',
    fontSize: 16,
  },
  fab: {
    position: 'absolute',
    bottom: 72,
    left: 16,
    right: 16,
    backgroundColor: COLORS.accent,
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.22,
    shadowRadius: 8,
    elevation: 6,
  },
  fabText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: 'bold',
    letterSpacing: 0.3,
  },
  importBtn: {
    position: 'absolute',
    bottom: 16,
    left: 16,
    right: 16,
    backgroundColor: COLORS.primaryLight,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  importBtnText: {
    color: COLORS.white,
    fontSize: 15,
    fontWeight: '600',
  },
});
