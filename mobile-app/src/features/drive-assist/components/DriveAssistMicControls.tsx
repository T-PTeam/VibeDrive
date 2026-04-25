import React from 'react';
import {
  TouchableOpacity,
  Text,
  ActivityIndicator,
  StyleProp,
  ViewStyle,
} from 'react-native';
import styled from 'styled-components/native';

type Variant = 'drive' | 'floating' | 'inline';

type Props = {
  variant: Variant;
  isRecording: boolean;
  isUploading: boolean;
  recordingDuration: number;
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
};

const Wrapper = styled.View<{ $variant: Variant }>`
  ${(p) =>
    p.$variant === 'floating'
      ? `
    position: absolute;
    bottom: 172px;
    left: 0;
    right: 0;
    align-items: center;
    z-index: 20;
  `
      : p.$variant === 'inline'
        ? `
    align-items: center;
    justify-content: center;
  `
        : `
    flex: 1;
    justify-content: center;
    align-items: center;
    padding: 24px;
  `}
`;

const MicButton = styled(TouchableOpacity)<{ $active: boolean }>`
  width: 120px;
  height: 120px;
  border-radius: 60px;
  background-color: ${(p) => (p.$active ? '#1a1a1a' : '#000000')};
  justify-content: center;
  align-items: center;
  border-width: 3px;
  border-color: ${(p) => (p.$active ? '#ff4444' : '#000000')};
`;

const MicIcon = styled.Text`
  font-size: 48px;
`;

const StatusText = styled.Text<{ $floating: boolean }>`
  margin-top: 24px;
  font-size: 14px;
  color: ${(p) => (p.$floating ? '#e8e8e8' : '#888888')};
`;

const UploadRow = styled.View`
  flex-direction: row;
  align-items: center;
  margin-top: 16px;
`;

const UploadText = styled.Text`
  font-size: 14px;
  color: #888888;
  margin-left: 8px;
`;

export default function DriveAssistMicControls({
  variant,
  isRecording,
  isUploading,
  recordingDuration,
  onPress,
  style,
}: Props) {
  const floating = variant === 'floating';
  const inline = variant === 'inline';

  return (
    <Wrapper $variant={variant} style={style}>
      <MicButton
        $active={isRecording}
        onPress={onPress}
        activeOpacity={0.8}
        accessibilityLabel="Microphone"
        accessibilityRole="button"
      >
        <MicIcon>🎤</MicIcon>
      </MicButton>
      {!inline && isRecording ? (
        <StatusText $floating={floating}>
          Recording...{' '}
          {recordingDuration > 0 && `${Math.floor(recordingDuration)}s`}
        </StatusText>
      ) : null}
      {!inline && isUploading ? (
        <UploadRow>
          <ActivityIndicator
            size="small"
            color={floating ? '#cccccc' : '#888888'}
          />
          <UploadText>Uploading...</UploadText>
        </UploadRow>
      ) : null}
    </Wrapper>
  );
}
