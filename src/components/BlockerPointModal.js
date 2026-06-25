import React, { useState, useEffect } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Alert,
} from 'react-native';
import COLORS from '../theme/colors';

/**
 * Modal for adding or editing a blocker point on a route.
 *
 * Props:
 *   visible      – boolean
 *   point        – existing BlockerPoint object (null when adding new)
 *   onSave(data) – called with the updated/new point fields
 *   onCancel()   – called when the user dismisses without saving
 */
export default function BlockerPointModal({ visible, point, onSave, onCancel }) {
  const [name, setName] = useState('');
  const [positionDescription, setPositionDescription] = useState('');
  const [blockersNeeded, setBlockersNeeded] = useState(1);
  const [triggerRadius, setTriggerRadius] = useState(200);
  const [customAnnouncement, setCustomAnnouncement] = useState('');

  // Populate fields when modal opens
  useEffect(() => {
    if (visible) {
      setName(point?.name ?? '');
      setPositionDescription(point?.positionDescription ?? '');
      setBlockersNeeded(point?.blockersNeeded ?? 1);
      setTriggerRadius(point?.triggerRadius ?? 200);
      setCustomAnnouncement(point?.customAnnouncement ?? '');
    }
  }, [visible, point]);

  const adjustBlockers = (delta) =>
    setBlockersNeeded((prev) => Math.max(1, prev + delta));

  const handleSave = () => {
    if (!name.trim()) {
      Alert.alert('Required', 'Please enter an intersection or location name.');
      return;
    }
    const radius = parseInt(String(triggerRadius), 10);
    onSave({
      name: name.trim(),
      positionDescription: positionDescription.trim(),
      blockersNeeded: Math.max(1, blockersNeeded),
      triggerRadius: isNaN(radius) || radius < 30 ? 200 : radius,
      customAnnouncement: customAnnouncement.trim(),
    });
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onCancel}
    >
      <KeyboardAvoidingView
        style={styles.overlay}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View style={styles.sheet}>
          <Text style={styles.title}>
            {point ? 'Edit Blocker Point' : 'Add Blocker Point'}
          </Text>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Location name */}
            <Text style={styles.label}>Intersection / Location Name *</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="e.g. Oak St & Main Ave"
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="next"
              autoCapitalize="words"
            />

            {/* Position description */}
            <Text style={styles.label}>Position Description</Text>
            <TextInput
              style={styles.input}
              value={positionDescription}
              onChangeText={setPositionDescription}
              placeholder="e.g. NW corner, east side, median"
              placeholderTextColor={COLORS.textSecondary}
              returnKeyType="next"
              autoCapitalize="sentences"
            />

            {/* Blockers needed counter */}
            <Text style={styles.label}>Blockers Needed</Text>
            <View style={styles.counterRow}>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => adjustBlockers(-1)}
                accessibilityLabel="Decrease blockers"
              >
                <Text style={styles.counterBtnText}>−</Text>
              </TouchableOpacity>
              <Text style={styles.counterValue}>{blockersNeeded}</Text>
              <TouchableOpacity
                style={styles.counterBtn}
                onPress={() => adjustBlockers(1)}
                accessibilityLabel="Increase blockers"
              >
                <Text style={styles.counterBtnText}>+</Text>
              </TouchableOpacity>
            </View>

            {/* Trigger distance */}
            <Text style={styles.label}>Trigger Distance (metres)</Text>
            <Text style={styles.hint}>
              Announcement plays when you are within this distance of the point. Default 200 m (~650 ft).
            </Text>
            <TextInput
              style={styles.input}
              value={String(triggerRadius)}
              onChangeText={(t) => setTriggerRadius(t)}
              keyboardType="numeric"
              placeholder="200"
              placeholderTextColor={COLORS.textSecondary}
            />

            {/* Custom announcement */}
            <Text style={styles.label}>Custom Announcement (optional)</Text>
            <Text style={styles.hint}>
              If blank, the announcement is auto-generated from the fields above.
            </Text>
            <TextInput
              style={[styles.input, styles.multiline]}
              value={customAnnouncement}
              onChangeText={setCustomAnnouncement}
              placeholder="Leave empty to auto-generate"
              placeholderTextColor={COLORS.textSecondary}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
              autoCapitalize="sentences"
            />
          </ScrollView>

          {/* Action buttons */}
          <View style={styles.buttonRow}>
            <TouchableOpacity style={styles.cancelBtn} onPress={onCancel}>
              <Text style={styles.cancelBtnText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleSave}>
              <Text style={styles.saveBtnText}>Save Point</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  sheet: {
    backgroundColor: COLORS.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    maxHeight: '90%',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: COLORS.text,
    marginBottom: 16,
    textAlign: 'center',
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 14,
    marginBottom: 4,
  },
  hint: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginBottom: 4,
  },
  input: {
    borderWidth: 1,
    borderColor: '#dde0e8',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
    fontSize: 15,
    color: COLORS.text,
    backgroundColor: '#f9fafb',
  },
  multiline: {
    height: 80,
    paddingTop: 10,
  },
  counterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    marginTop: 4,
  },
  counterBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  counterBtnText: {
    color: COLORS.white,
    fontSize: 22,
    fontWeight: 'bold',
    lineHeight: 26,
  },
  counterValue: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
    minWidth: 40,
    textAlign: 'center',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 8 : 0,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: COLORS.textSecondary,
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    fontWeight: '600',
  },
  saveBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 10,
    backgroundColor: COLORS.primary,
    alignItems: 'center',
  },
  saveBtnText: {
    fontSize: 16,
    color: COLORS.white,
    fontWeight: 'bold',
  },
});
