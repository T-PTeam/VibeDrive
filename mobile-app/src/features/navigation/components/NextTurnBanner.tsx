import React from 'react';
import styled from 'styled-components/native';
import type { RouteStepDto } from '../../../types/navigation';
import {
  getManeuverKind,
  formatStepDistance,
  type ManeuverKind,
} from '../utils/getManeuverKind';

type Props = {
  step: RouteStepDto | null;
  distanceMeters: number | null;
  visible: boolean;
};

const MANEUVER_ICONS: Record<ManeuverKind, string> = {
  straight: '↑',
  'turn-left': '←',
  'turn-right': '→',
  'slight-left': '↖',
  'slight-right': '↗',
  'sharp-left': '↙',
  'sharp-right': '↘',
  'u-turn': '↩',
  roundabout: '↺',
  arrive: '●',
  depart: '▶',
};

function getIconColor(kind: ManeuverKind): string {
  if (kind === 'arrive') return '#22c55e';
  if (kind === 'u-turn' || kind === 'roundabout') return '#f97316';
  return '#4a90ff';
}

const Banner = styled.View`
  position: absolute;
  top: 12px;
  left: 12px;
  right: 12px;
  flex-direction: row;
  align-items: center;
  background-color: rgba(10, 10, 20, 0.92);
  border-radius: 16px;
  padding: 12px 16px;
  elevation: 8;
  shadow-color: #000000;
  shadow-offset: 0px 4px;
  shadow-opacity: 0.4;
  shadow-radius: 8px;
  z-index: 30;
`;

const IconBox = styled.View<{ $color: string }>`
  width: 48px;
  height: 48px;
  border-radius: 12px;
  background-color: ${(p) => p.$color};
  align-items: center;
  justify-content: center;
  margin-right: 12px;
`;

const IconLabel = styled.Text`
  font-size: 24px;
  color: #ffffff;
`;

const TextBlock = styled.View`
  flex: 1;
`;

const InstructionText = styled.Text`
  font-size: 16px;
  font-weight: 700;
  color: #f0f0f5;
  line-height: 22px;
`;

const DistanceText = styled.Text`
  font-size: 14px;
  color: #4a90ff;
  font-weight: 600;
  margin-top: 2px;
`;

export default function NextTurnBanner({
  step,
  distanceMeters,
  visible,
}: Props) {
  if (!visible || !step) return null;

  const kind = getManeuverKind(step.instruction);
  const icon = MANEUVER_ICONS[kind];
  const color = getIconColor(kind);
  const dist = distanceMeters ?? step.distance_meters;

  return (
    <Banner>
      <IconBox $color={color}>
        <IconLabel>{icon}</IconLabel>
      </IconBox>
      <TextBlock>
        <InstructionText numberOfLines={2}>{step.instruction}</InstructionText>
        <DistanceText>{formatStepDistance(dist)}</DistanceText>
      </TextBlock>
    </Banner>
  );
}
