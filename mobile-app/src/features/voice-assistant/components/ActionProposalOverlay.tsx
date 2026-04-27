import React from 'react';
import { Modal } from 'react-native';
import styled from 'styled-components/native';

const Backdrop = styled.Pressable`
  flex: 1;
  background-color: rgba(0, 0, 0, 0.55);
  justify-content: center;
  align-items: center;
  padding: 24px;
`;

const Card = styled.View`
  background-color: #1c1c22;
  border-radius: 14px;
  padding: 20px;
  width: 100%;
  max-width: 400px;
  border-width: 1px;
  border-color: #333342;
`;

const Title = styled.Text`
  color: #f2f2f7;
  font-size: 17px;
  font-weight: 600;
  margin-bottom: 10px;
`;

const Body = styled.Text`
  color: #c7c7d1;
  font-size: 15px;
  line-height: 22px;
  margin-bottom: 18px;
`;

const Meta = styled.Text`
  color: #8e8e93;
  font-size: 12px;
  margin-bottom: 18px;
`;

const Row = styled.View`
  flex-direction: row;
  gap: 12px;
  justify-content: flex-end;
`;

const Btn = styled.TouchableOpacity<{ $primary?: boolean }>`
  padding-vertical: 12px;
  padding-horizontal: 18px;
  border-radius: 10px;
  background-color: ${(p) => (p.$primary ? '#000000' : '#333333')};
`;

const BtnText = styled.Text`
  color: #ffffff;
  font-size: 15px;
  font-weight: 600;
`;

export interface ActionProposalOverlayProps {
  visible: boolean;
  summaryText: string;
  loadId: string;
  oneBasedIndex: number | null;
  expiresAt: string | null;
  onConfirm: () => void;
  onReject: () => void;
}

export default function ActionProposalOverlay({
  visible,
  summaryText,
  loadId,
  oneBasedIndex,
  expiresAt,
  onConfirm,
  onReject,
}: ActionProposalOverlayProps) {
  const metaParts: string[] = [];
  if (loadId) metaParts.push(`Load ${loadId}`);
  if (oneBasedIndex != null) metaParts.push(`#${oneBasedIndex}`);
  if (expiresAt) metaParts.push(`Expires ${expiresAt}`);
  const meta = metaParts.join(' · ');

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onReject}
    >
      <Backdrop onPress={onReject}>
        <Card>
          <Title>Confirm action</Title>
          <Body>{summaryText || 'Confirm this load acceptance?'}</Body>
          {meta ? <Meta>{meta}</Meta> : null}
          <Row>
            <Btn onPress={onReject} accessibilityRole="button">
              <BtnText>Reject</BtnText>
            </Btn>
            <Btn $primary onPress={onConfirm} accessibilityRole="button">
              <BtnText>Confirm</BtnText>
            </Btn>
          </Row>
        </Card>
      </Backdrop>
    </Modal>
  );
}
