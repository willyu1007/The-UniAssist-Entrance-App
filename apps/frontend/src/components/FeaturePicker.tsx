import React, { useState, useRef } from 'react';
import {
  Pressable,
  View,
  Modal,
  FlatList,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

export interface FeatureOption {
  key: string;
  label: string;
}

export interface FeaturePickerProps {
  options: FeatureOption[];
  selectedKey: string;
  onSelect: (key: string) => void;
}

/**
 * A capsule-shaped dropdown trigger that opens a simple modal list
 * for feature / mode switching.
 */
export function FeaturePicker({
  options,
  selectedKey,
  onSelect,
}: FeaturePickerProps) {
  const t = useThemeTokens();
  const [open, setOpen] = useState(false);

  const selectedLabel =
    options.find((o) => o.key === selectedKey)?.label ?? '选择';

  return (
    <>
      {/* Trigger */}
      <Pressable
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          styles.trigger,
          {
            borderColor: t.color.border,
            borderWidth: t.border.width.sm,
            borderRadius: t.radius.full,
            backgroundColor: pressed
              ? t.color.borderSubtle
              : 'transparent',
            paddingVertical: t.space[2],
            paddingHorizontal: t.space[4],
          },
        ]}
      >
        <Text variant="label" tone="primary">
          {selectedLabel}
        </Text>
        <Ionicons
          name="chevron-down"
          size={14}
          color={t.color.textSecondary}
          style={{ marginLeft: t.space[1] }}
        />
      </Pressable>

      {/* Dropdown modal */}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
          <View
            style={[
              styles.dropdown,
              {
                backgroundColor: t.color.surface,
                borderColor: t.color.border,
                borderWidth: t.border.width.sm,
                borderRadius: t.radius.lg,
                ...t.shadow.md,
              },
            ]}
          >
            <FlatList
              data={options}
              keyExtractor={(item) => item.key}
              renderItem={({ item }) => (
                <Pressable
                  onPress={() => {
                    onSelect(item.key);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.option,
                    {
                      backgroundColor:
                        item.key === selectedKey
                          ? t.color.borderSubtle
                          : pressed
                            ? t.color.surfaceElevated
                            : 'transparent',
                      paddingVertical: t.space[3],
                      paddingHorizontal: t.space[4],
                    },
                  ]}
                >
                  <Text
                    variant="body"
                    tone={item.key === selectedKey ? 'primary' : 'secondary'}
                  >
                    {item.label}
                  </Text>
                </Pressable>
              )}
            />
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  dropdown: {
    width: 260,
    maxHeight: 320,
    overflow: 'hidden',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
  },
});
