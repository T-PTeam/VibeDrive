import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  Pressable,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Dimensions,
} from 'react-native';

export interface LoadOfferPayload {
  id: string;
  origin: string;
  destination: string;
  rate: number | string;
  weightKg?: number;
  volumeM3?: number;
  distanceKm?: number;
  source?: string;
  currency?: string;
}

interface LoadOfferCardProps {
  visible: boolean;
  load: LoadOfferPayload | null;
  onAccept: (id: string) => void;
  onDismiss: (id: string) => void;
  onClose: () => void;
}

const CARD_HEIGHT = 280;
const ANIMATION_DURATION = 250;

export default function LoadOfferCard({
  visible,
  load,
  onAccept,
  onDismiss,
  onClose,
}: LoadOfferCardProps) {
  const translateY = useRef(new Animated.Value(CARD_HEIGHT)).current;

  useEffect(() => {
    if (visible && load) {
      Animated.timing(translateY, {
        toValue: 0,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(translateY, {
        toValue: CARD_HEIGHT,
        duration: ANIMATION_DURATION,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, load, translateY]);

  if (!load) {
    return null;
  }

  const rateDisplay =
    typeof load.rate === 'number'
      ? `${load.currency ?? 'USD'} ${load.rate.toLocaleString()}`
      : `${load.currency ?? 'USD'} ${load.rate}`;

  const runCloseAnimation = (callback: () => void) => {
    Animated.timing(translateY, {
      toValue: CARD_HEIGHT,
      duration: ANIMATION_DURATION,
      useNativeDriver: true,
    }).start(() => callback());
  };

  const handleAccept = () => {
    runCloseAnimation(() => onAccept(load.id));
  };

  const handleDismiss = () => {
    runCloseAnimation(() => onDismiss(load.id));
  };

  const handleOverlayPress = () => {
    runCloseAnimation(onClose);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleOverlayPress}
    >
      <Pressable style={styles.overlay} onPress={handleOverlayPress}>
        <Pressable
          style={styles.cardContainer}
          onPress={(e) => e.stopPropagation()}
        >
          <Animated.View
            style={[
              styles.card,
              {
                transform: [{ translateY }],
              },
            ]}
          >
            <Text style={styles.title}>Load offer</Text>
            <View style={styles.details}>
              <Text style={styles.route}>
                {load.origin} → {load.destination}
              </Text>
              <Text style={styles.rate}>{rateDisplay}</Text>
              {load.weightKg != null && (
                <Text style={styles.meta}>Weight: {load.weightKg} kg</Text>
              )}
              {load.volumeM3 != null && (
                <Text style={styles.meta}>Volume: {load.volumeM3} m³</Text>
              )}
              {load.distanceKm != null && (
                <Text style={styles.meta}>Distance: {load.distanceKm} km</Text>
              )}
              {load.source != null && load.source !== '' && (
                <Text style={styles.meta}>Source: {load.source}</Text>
              )}
            </View>
            <View style={styles.actions}>
              <TouchableOpacity
                style={[styles.button, styles.dismissButton]}
                onPress={handleDismiss}
              >
                <Text style={styles.dismissButtonText}>Dismiss</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.button, styles.acceptButton]}
                onPress={handleAccept}
              >
                <Text style={styles.acceptButtonText}>Accept</Text>
              </TouchableOpacity>
            </View>
          </Animated.View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  cardContainer: {
    width,
    alignItems: 'center',
  },
  card: {
    width: width - 32,
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    padding: 24,
    minHeight: CARD_HEIGHT,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 16,
  },
  details: {
    marginBottom: 24,
  },
  route: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
    marginBottom: 8,
  },
  rate: {
    fontSize: 18,
    fontWeight: '700',
    color: '#000000',
    marginBottom: 8,
  },
  meta: {
    fontSize: 14,
    color: '#666666',
    marginTop: 4,
  },
  actions: {
    flexDirection: 'row',
    gap: 12,
    justifyContent: 'flex-end',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    minWidth: 100,
    alignItems: 'center',
  },
  dismissButton: {
    backgroundColor: '#e0e0e0',
  },
  dismissButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333333',
  },
  acceptButton: {
    backgroundColor: '#000000',
  },
  acceptButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#ffffff',
  },
});
