import React from 'react';
import { ActivityIndicator } from 'react-native';
import styled from 'styled-components/native';
import PlaceSearchInput from './PlaceSearchInput';

type Props = {
  originText: string;
  destText: string;
  onChangeOrigin: (value: string) => void;
  onChangeDest: (value: string) => void;
  onStartDriving: () => void | Promise<void>;
  isApplying: boolean;
};

const Container = styled.View`
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  padding: 16px;
  padding-top: 12px;
  background-color: rgba(255, 255, 255, 0.96);
  border-bottom-width: 1px;
  border-bottom-color: #e5e5e5;
  z-index: 30;
  overflow: visible;
`;

const PrimaryButton = styled.TouchableOpacity<{ $disabled: boolean }>`
  height: 48px;
  border-radius: 12px;
  background-color: ${(p) => (p.$disabled ? '#888888' : '#000000')};
  align-items: center;
  justify-content: center;
`;

const PrimaryButtonText = styled.Text`
  color: #ffffff;
  font-size: 16px;
  font-weight: 800;
`;

export default function NavigationFields({
  originText,
  destText,
  onChangeOrigin,
  onChangeDest,
  onStartDriving,
  isApplying,
}: Props) {
  const disabled = isApplying || !originText.trim() || !destText.trim();

  return (
    <Container>
      <PlaceSearchInput
        label="From"
        value={originText}
        onChangeText={onChangeOrigin}
        placeholder="Where are you starting?"
        returnKeyType="next"
        zIndexBase={40}
      />
      <PlaceSearchInput
        label="To"
        value={destText}
        onChangeText={onChangeDest}
        placeholder="Destination"
        returnKeyType="done"
        onSubmitEditing={() => {
          if (!disabled) {
            void onStartDriving();
          }
        }}
        zIndexBase={55}
      />
      <PrimaryButton
        $disabled={disabled}
        disabled={disabled}
        onPress={() => {
          void onStartDriving();
        }}
        activeOpacity={0.9}
        accessibilityRole="button"
        accessibilityLabel="Start driving"
      >
        {isApplying ? (
          <ActivityIndicator color="#ffffff" />
        ) : (
          <PrimaryButtonText>Start driving</PrimaryButtonText>
        )}
      </PrimaryButton>
    </Container>
  );
}
