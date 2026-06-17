import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { openTerms, openPrivacy } from '../utils/legal';

interface LegalAgreementProps {
  checked: boolean;
  onToggle: () => void;
  showError?: boolean;
}

export default function LegalAgreement({
  checked,
  onToggle,
  showError,
}: LegalAgreementProps) {
  return (
    <View style={styles.container}>
      <TouchableOpacity
        style={styles.row}
        onPress={onToggle}
        activeOpacity={0.7}
      >
        <View style={[styles.checkbox, checked && styles.checkboxChecked]}>
          {checked ? <Text style={styles.checkmark}>✓</Text> : null}
        </View>
        <View style={styles.textWrap}>
          <Text style={styles.label}>
            {'I agree to the '}
            <Text style={styles.link} onPress={openTerms}>
              Terms of Use
            </Text>
            {' and '}
            <Text style={styles.link} onPress={openPrivacy}>
              Privacy Policy
            </Text>
          </Text>
        </View>
      </TouchableOpacity>
      {showError ? (
        <Text style={styles.error}>
          Please accept the Terms and Privacy Policy to continue.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    marginVertical: 12,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  checkbox: {
    width: 22,
    height: 22,
    borderWidth: 2,
    borderColor: '#000000',
    borderRadius: 4,
    marginRight: 10,
    marginTop: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#ffffff',
  },
  checkboxChecked: {
    backgroundColor: '#000000',
  },
  checkmark: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: 'bold',
    lineHeight: 16,
  },
  textWrap: {
    flex: 1,
  },
  label: {
    fontSize: 14,
    color: '#333333',
    lineHeight: 20,
  },
  link: {
    color: '#000000',
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  error: {
    marginTop: 6,
    marginLeft: 32,
    fontSize: 12,
    color: '#cc0000',
  },
});
