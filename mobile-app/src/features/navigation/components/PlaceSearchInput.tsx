import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  FlatList,
  Keyboard,
  ActivityIndicator,
  ListRenderItemInfo,
  Platform,
} from 'react-native';
import styled from 'styled-components/native';
import type { GeocodeSuggestionDto } from '../../../types/navigation';
import { navigationService } from '../../../services/NavigationService';
import { logAsyncError } from '../../../utils/asyncErrors';
import { useDebouncedValue } from '../utils/useDebouncedValue';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  returnKeyType?: 'done' | 'next' | 'search' | 'go';
  onSubmitEditing?: () => void;
  zIndexBase: number;
};

const FieldBlock = styled.View<{ $z: number; $focused: boolean }>`
  margin-bottom: 12px;
  z-index: ${(p) => p.$z};
  overflow: visible;
  elevation: ${(p) => (Platform.OS === 'android' && p.$focused ? 18 : 0)};
`;

const LabelText = styled.Text`
  font-size: 12px;
  font-weight: 700;
  color: #333333;
  margin-bottom: 6px;
`;

const InputOuter = styled.View`
  position: relative;
`;

const TextField = styled.TextInput`
  height: 44px;
  border-width: 1px;
  border-color: #e0e0e0;
  border-radius: 10px;
  padding: 0 14px;
  font-size: 16px;
  background-color: #ffffff;
`;

const SuggestionsPanel = styled.View<{ $z: number }>`
  position: absolute;
  left: 0;
  right: 0;
  top: 48px;
  max-height: 220px;
  background-color: #ffffff;
  border-radius: 10px;
  border-width: 1px;
  border-color: #e0e0e0;
  z-index: ${(p) => p.$z + 20};
  elevation: 8;
  shadow-color: #000000;
  shadow-opacity: 0.15;
  shadow-radius: 10px;
  shadow-offset: 0px 4px;
`;

const LoadingRow = styled.View`
  padding: 14px;
  align-items: center;
`;

const SuggestionRow = styled.TouchableOpacity`
  padding: 12px 14px;
  border-bottom-width: 1px;
  border-bottom-color: #f0f0f0;
`;

const SuggestionText = styled.Text`
  font-size: 15px;
  color: #111111;
`;

export default function PlaceSearchInput({
  label,
  value,
  onChangeText,
  placeholder,
  returnKeyType = 'done',
  onSubmitEditing,
  zIndexBase,
}: Props) {
  const [focused, setFocused] = useState(false);
  const [suggestions, setSuggestions] = useState<GeocodeSuggestionDto[]>([]);
  const [loading, setLoading] = useState(false);
  const blurTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const debounced = useDebouncedValue(value, 320);

  const clearBlurTimer = useCallback(() => {
    if (blurTimerRef.current != null) {
      clearTimeout(blurTimerRef.current);
      blurTimerRef.current = null;
    }
  }, []);

  const handleFocus = useCallback(() => {
    clearBlurTimer();
    setFocused(true);
  }, [clearBlurTimer]);

  const handleBlur = useCallback(() => {
    clearBlurTimer();
    blurTimerRef.current = setTimeout(() => {
      setFocused(false);
      setSuggestions([]);
      blurTimerRef.current = null;
    }, 220);
  }, [clearBlurTimer]);

  useEffect(() => {
    if (debounced.trim().length < 2) {
      setSuggestions([]);
      setLoading(false);
      return;
    }

    const ac = new AbortController();
    setLoading(true);
    navigationService
      .suggest(debounced, ac.signal)
      .then((rows) => {
        if (!ac.signal.aborted) {
          setSuggestions(rows);
        }
      })
      .catch((e) => {
        logAsyncError('PlaceSearchInput', 'suggest', e);
        if (!ac.signal.aborted) {
          setSuggestions([]);
        }
      })
      .finally(() => {
        if (!ac.signal.aborted) {
          setLoading(false);
        }
      });

    return () => ac.abort();
  }, [debounced]);

  const showPanel =
    focused && value.trim().length >= 2 && (loading || suggestions.length > 0);

  const stackZ = focused ? zIndexBase + 220 : zIndexBase;

  const pickSuggestion = useCallback(
    (item: GeocodeSuggestionDto) => {
      clearBlurTimer();
      onChangeText(item.formatted);
      setSuggestions([]);
      setFocused(false);
      Keyboard.dismiss();
    },
    [clearBlurTimer, onChangeText]
  );

  const renderItem = useCallback(
    ({ item }: ListRenderItemInfo<GeocodeSuggestionDto>) => (
      <SuggestionRow
        onPress={() => pickSuggestion(item)}
        activeOpacity={0.65}
        accessibilityRole="button"
        accessibilityLabel={item.formatted}
      >
        <SuggestionText numberOfLines={2}>{item.formatted}</SuggestionText>
      </SuggestionRow>
    ),
    [pickSuggestion]
  );

  return (
    <FieldBlock $z={stackZ} $focused={focused}>
      <LabelText>{label}</LabelText>
      <InputOuter>
        <TextField
          value={value}
          onChangeText={onChangeText}
          autoCapitalize="words"
          autoCorrect={false}
          placeholder={placeholder}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />
        {showPanel ? (
          <SuggestionsPanel $z={stackZ}>
            {loading && suggestions.length === 0 ? (
              <LoadingRow>
                <ActivityIndicator size="small" color="#666666" />
              </LoadingRow>
            ) : (
              <FlatList
                data={suggestions}
                keyExtractor={(item) => item.id}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
                renderItem={renderItem}
                ListFooterComponent={
                  loading && suggestions.length > 0 ? (
                    <LoadingRow>
                      <ActivityIndicator size="small" color="#666666" />
                    </LoadingRow>
                  ) : null
                }
              />
            )}
          </SuggestionsPanel>
        ) : null}
      </InputOuter>
    </FieldBlock>
  );
}
