import React, { useCallback, useMemo, useState } from 'react';
import {
  Modal,
  FlatList,
  ActivityIndicator,
  ListRenderItemInfo,
  InteractionManager,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import styled from 'styled-components/native';
import * as Speech from 'expo-speech';
import type { Voice } from 'expo-speech';
import { VoiceQuality } from 'expo-speech';
import { getStoredTtsVoiceId, setStoredTtsVoiceId } from '../ttsVoicePrefs';
import { invalidateTtsVoiceCache, speakDriverLine } from '../speakDriverLine';
import { TTS_MESSAGES } from '../ttsConstants';
import { loadsService } from '../../../services/LoadsService';
import { logAsyncError, logAsyncRejection } from '../../../utils/asyncErrors';

const SectionLabel = styled.Text`
  font-size: 14px;
  font-weight: 600;
  color: #333333;
  margin-bottom: 8px;
  margin-top: 8px;
`;

const SelectButton = styled.TouchableOpacity`
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 8px;
  padding: 0 16px;
  height: 50px;
  justify-content: center;
  margin-bottom: 8px;
`;

const SelectButtonText = styled.Text`
  font-size: 16px;
  color: #111111;
`;

const ModalRoot = styled.View`
  flex: 1;
  background-color: #ffffff;
  padding-top: 56px;
`;

const ModalHeader = styled.View`
  flex-direction: row;
  align-items: center;
  justify-content: space-between;
  padding-horizontal: 16px;
  padding-bottom: 12px;
  border-bottom-width: 1px;
  border-bottom-color: #e5e5e5;
`;

const ModalTitle = styled.Text`
  font-size: 18px;
  font-weight: 700;
  color: #111111;
`;

const DoneButton = styled.TouchableOpacity`
  padding-vertical: 8px;
  padding-horizontal: 4px;
`;

const DoneLabel = styled.Text`
  font-size: 16px;
  color: #0066cc;
  font-weight: 600;
`;

const VoiceRow = styled.TouchableOpacity<{ $selected: boolean }>`
  padding: 14px 16px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
  background-color: ${(p) => (p.$selected ? '#f5f5f5' : '#ffffff')};
`;

const VoiceName = styled.Text`
  font-size: 16px;
  color: #111111;
`;

const VoiceMeta = styled.Text`
  font-size: 12px;
  color: #888888;
  margin-top: 4px;
`;

type Props = {
  userId: string;
};

export default function TtsVoiceSection({ userId }: Props) {
  const [loading, setLoading] = useState(true);
  const [voices, setVoices] = useState<Voice[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [v, stored, serverId] = await Promise.all([
        Speech.getAvailableVoicesAsync(),
        getStoredTtsVoiceId(),
        loadsService.getTtsVoice(userId),
      ]);
      const en = v
        .filter((x) => x.language?.toLowerCase().startsWith('en'))
        .sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      setVoices(en);
      if (typeof serverId === 'string' && serverId.trim() !== '') {
        await setStoredTtsVoiceId(serverId);
        invalidateTtsVoiceCache();
        setCurrentId(serverId);
      } else {
        setCurrentId(stored);
      }
    } catch (e) {
      logAsyncError('TtsVoiceSection', 'load', e);
      setVoices([]);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(logAsyncRejection('TtsVoiceSection', 'loadOnFocus'));
    }, [load])
  );

  const currentLabel = useMemo(() => {
    if (!currentId) {
      return 'System default (auto)';
    }
    const v =
      voices.find((x) => x.identifier === currentId) ??
      voices.find(
        (x) => x.identifier.toLowerCase() === currentId.toLowerCase()
      );
    return v?.name ?? currentId;
  }, [currentId, voices]);

  const handlePick = useCallback(
    async (v: Voice | null) => {
      try {
        if (v == null) {
          await setStoredTtsVoiceId(null);
          invalidateTtsVoiceCache();
          setCurrentId(null);
          await loadsService.setTtsVoice(userId, null);
        } else {
          await setStoredTtsVoiceId(v.identifier);
          invalidateTtsVoiceCache();
          setCurrentId(v.identifier);
          await loadsService.setTtsVoice(userId, v.identifier);
        }
        setModalVisible(false);
        InteractionManager.runAfterInteractions(() => {
          setTimeout(() => {
            void speakDriverLine(TTS_MESSAGES.voiceUpdated).catch(
              logAsyncRejection('TtsVoiceSection', 'previewVoice')
            );
          }, 400);
        });
      } catch (e) {
        logAsyncError('TtsVoiceSection', 'handlePick', e);
      }
    },
    [userId]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<Voice>) => (
      <VoiceRow
        $selected={item.identifier === currentId}
        onPress={() => {
          void handlePick(item).catch(
            logAsyncRejection('TtsVoiceSection', 'handlePickRow')
          );
        }}
        activeOpacity={0.65}
      >
        <VoiceName>{item.name}</VoiceName>
        <VoiceMeta>
          {item.language}
          {item.quality === VoiceQuality.Enhanced ? ' · Enhanced' : ''}
        </VoiceMeta>
      </VoiceRow>
    ),
    [currentId, handlePick]
  );

  return (
    <>
      <SectionLabel>Assistant voice</SectionLabel>
      <SelectButton
        onPress={() => setModalVisible(true)}
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel="Choose assistant voice"
      >
        {loading ? (
          <ActivityIndicator />
        ) : (
          <SelectButtonText numberOfLines={1}>{currentLabel}</SelectButtonText>
        )}
      </SelectButton>

      <Modal
        visible={modalVisible}
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <ModalRoot>
          <ModalHeader>
            <ModalTitle>Assistant voice</ModalTitle>
            <DoneButton
              onPress={() => setModalVisible(false)}
              accessibilityRole="button"
              accessibilityLabel="Close voice list"
            >
              <DoneLabel>Done</DoneLabel>
            </DoneButton>
          </ModalHeader>
          <VoiceRow
            $selected={currentId == null}
            onPress={() => {
              void handlePick(null).catch(
                logAsyncRejection('TtsVoiceSection', 'handlePickDefault')
              );
            }}
            activeOpacity={0.65}
          >
            <VoiceName>System default (auto)</VoiceName>
            <VoiceMeta>Best available English on this device</VoiceMeta>
          </VoiceRow>
          <FlatList
            data={voices}
            keyExtractor={(item) => item.identifier}
            renderItem={renderItem}
            keyboardShouldPersistTaps="handled"
          />
        </ModalRoot>
      </Modal>
    </>
  );
}
