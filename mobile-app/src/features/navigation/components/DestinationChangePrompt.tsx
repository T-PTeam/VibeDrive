import React from 'react';
import { Modal } from 'react-native';
import styled from 'styled-components/native';

type Props = {
  visible: boolean;
  currentDest: string;
  proposedDest: string;
  onAccept: () => void;
  onReject: () => void;
};

const Backdrop = styled.View`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.45);
  justify-content: center;
  padding: 24px;
`;

const Card = styled.View`
  background-color: #ffffff;
  border-radius: 16px;
  padding: 16px;
`;

const Title = styled.Text`
  font-size: 16px;
  font-weight: 800;
  color: #111111;
  margin-bottom: 8px;
`;

const Line = styled.Text`
  font-size: 14px;
  color: #333333;
  margin-top: 6px;
`;

const Muted = styled.Text`
  font-size: 12px;
  color: #666666;
  margin-top: 12px;
`;

const Row = styled.View`
  flex-direction: row;
  margin-top: 16px;
`;

const Button = styled.TouchableOpacity<{ $variant: 'primary' | 'secondary' }>`
  flex: 1;
  height: 44px;
  border-radius: 12px;
  align-items: center;
  justify-content: center;
  background-color: ${(p) =>
    p.$variant === 'primary' ? '#000000' : '#333333'};
`;

const ButtonText = styled.Text`
  font-size: 14px;
  font-weight: 800;
  color: #ffffff;
`;

const Spacer = styled.View`
  width: 10px;
`;

export default function DestinationChangePrompt({
  visible,
  currentDest,
  proposedDest,
  onAccept,
  onReject,
}: Props) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <Backdrop>
        <Card>
          <Title>Change destination?</Title>
          <Line>Current: {currentDest || '—'}</Line>
          <Line>Proposed: {proposedDest || '—'}</Line>
          <Muted>Confirm to recalculate the route.</Muted>
          <Row>
            <Button
              $variant="secondary"
              onPress={onReject}
              accessibilityRole="button"
              accessibilityLabel="Reject destination change"
            >
              <ButtonText>Reject</ButtonText>
            </Button>
            <Spacer />
            <Button
              $variant="primary"
              onPress={onAccept}
              accessibilityRole="button"
              accessibilityLabel="Accept destination change"
            >
              <ButtonText>Accept</ButtonText>
            </Button>
          </Row>
        </Card>
      </Backdrop>
    </Modal>
  );
}
