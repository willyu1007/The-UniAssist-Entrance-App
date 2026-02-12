import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Modal,
  Pressable,
  Image,
  FlatList,
  StyleSheet,
  Alert,
  Animated,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

import { useThemeTokens } from '@/theme';
import { Text } from './ui';

/* ---------- Types ---------- */

export interface AttachmentSheetProps {
  visible: boolean;
  onClose: () => void;
  /** Called when user picks/takes an image. */
  onImageSelected?: (asset: ImagePicker.ImagePickerAsset) => void;
  /** Called when user taps a placeholder action. */
  onAction?: (action: string) => void;
}

/* ---------- Constants ---------- */

/** Thumbnail square size (dp). */
const THUMB_SIZE = 100;
/** Gap between thumbnails. */
const THUMB_GAP = 8;
/** How many recent photos to preload. */
const RECENT_PHOTO_COUNT = 15;

/* ---------- Menu items ---------- */

interface MenuItem {
  key: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  subtitle: string;
  implemented: boolean;
}

const MENU_ITEMS: MenuItem[] = [
  {
    key: 'search-content',
    icon: 'document-text-outline',
    label: '内容搜索',
    subtitle: '搜索文档与知识库',
    implemented: false,
  },
  {
    key: 'web-search',
    icon: 'globe-outline',
    label: '网页搜索',
    subtitle: '查找实时新闻和信息',
    implemented: false,
  },
  {
    key: 'research',
    icon: 'book-outline',
    label: '研究与学习',
    subtitle: '学习新知识点',
    implemented: false,
  },
];

/* ---------- Component ---------- */

export function AttachmentSheet({
  visible,
  onClose,
  onImageSelected,
  onAction,
}: AttachmentSheetProps) {
  const t = useThemeTokens();
  const insets = useSafeAreaInsets();

  /* ---- Recent photos state ---- */
  const [recentPhotos, setRecentPhotos] = useState<MediaLibrary.Asset[]>([]);
  const [mediaPermission, setMediaPermission] = useState(false);

  /* ---- Load recent photos when sheet opens (方案 A) ---- */
  useEffect(() => {
    if (!visible) return;

    let cancelled = false;

    (async () => {
      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted' || cancelled) {
        setMediaPermission(false);
        return;
      }
      setMediaPermission(true);

      const result = await MediaLibrary.getAssetsAsync({
        first: RECENT_PHOTO_COUNT,
        mediaType: MediaLibrary.MediaType.photo,
        sortBy: [MediaLibrary.SortBy.creationTime],
      });

      if (!cancelled) {
        setRecentPhotos(result.assets);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [visible]);

  /* ---- Slide animation ---- */
  const slideAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(slideAnim, {
        toValue: 1,
        useNativeDriver: true,
        damping: 20,
        stiffness: 200,
      }).start();
    } else {
      slideAnim.setValue(0);
    }
  }, [visible, slideAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [slideAnim, onClose]);

  /* ---- Image picker helpers ---- */

  const launchCamera = useCallback(async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('权限不足', '需要相机权限才能拍照');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onImageSelected?.(result.assets[0]);
      handleClose();
    }
  }, [onImageSelected, handleClose]);

  const launchGallery = useCallback(async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.8,
    });
    if (!result.canceled && result.assets[0]) {
      onImageSelected?.(result.assets[0]);
      handleClose();
    }
  }, [onImageSelected, handleClose]);

  /** When user taps a recent photo thumbnail, convert to ImagePickerAsset shape. */
  const handlePhotoTap = useCallback(
    async (asset: MediaLibrary.Asset) => {
      // Get full asset info (includes local uri)
      const info = await MediaLibrary.getAssetInfoAsync(asset);
      onImageSelected?.({
        uri: info.localUri ?? info.uri,
        width: info.width,
        height: info.height,
        type: 'image',
        assetId: info.id,
        fileName: info.filename,
      } as ImagePicker.ImagePickerAsset);
      handleClose();
    },
    [onImageSelected, handleClose],
  );

  /* ---- Computed transforms ---- */

  const SHEET_HEIGHT = 480;

  const translateY = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [SHEET_HEIGHT, 0],
  });

  const backdropOpacity = slideAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 0.4],
  });

  /* ---- Gallery row data: camera button + recent photos ---- */
  const galleryData = [
    { type: 'camera' as const, id: '__camera__' },
    ...recentPhotos.map((p) => ({ type: 'photo' as const, id: p.id, asset: p })),
  ];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={handleClose}
      statusBarTranslucent
    >
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={handleClose}>
        <Animated.View
          style={[styles.backdropFill, { opacity: backdropOpacity }]}
        />
      </Pressable>

      {/* Sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            backgroundColor: t.color.surface,
            borderTopLeftRadius: t.radius.xl,
            borderTopRightRadius: t.radius.xl,
            paddingBottom: Math.max(insets.bottom, t.space[4]),
            transform: [{ translateY }],
          },
        ]}
      >
        {/* Handle */}
        <View style={styles.handleRow}>
          <View
            style={[styles.handle, { backgroundColor: t.color.border }]}
          />
        </View>

        {/* ① Header: Logo + 全部照片 */}
        <View style={[styles.header, { paddingHorizontal: t.space[4] }]}>
          <Text
            variant="h2"
            style={{ color: t.color.textPrimary, fontWeight: '700' }}
          >
            MoreThan
          </Text>
          <Pressable
            onPress={launchGallery}
            hitSlop={8}
            style={({ pressed }) => ({ opacity: pressed ? 0.6 : 1 })}
          >
            <Text
              variant="label"
              style={{ color: t.color.accent }}
            >
              全部照片
            </Text>
          </Pressable>
        </View>

        {/* ② Horizontal photo gallery */}
        <FlatList
          data={galleryData}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{
            paddingHorizontal: t.space[4],
            paddingVertical: t.space[3],
          }}
          ItemSeparatorComponent={() => <View style={{ width: THUMB_GAP }} />}
          renderItem={({ item }) => {
            if (item.type === 'camera') {
              return (
                <Pressable
                  onPress={launchCamera}
                  style={({ pressed }) => [
                    styles.thumbBox,
                    {
                      backgroundColor: t.mode === 'dark' ? '#1A1A1A' : t.color.surfaceElevated,
                      borderRadius: t.radius.lg,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Ionicons
                    name="camera"
                    size={32}
                    color={t.color.textSecondary}
                  />
                </Pressable>
              );
            }

            return (
              <Pressable
                onPress={() => handlePhotoTap(item.asset!)}
                style={({ pressed }) => [
                  styles.thumbBox,
                  {
                    borderRadius: t.radius.lg,
                    overflow: 'hidden',
                    opacity: pressed ? 0.7 : 1,
                  },
                ]}
              >
                <Image
                  source={{ uri: item.asset!.uri }}
                  style={styles.thumbImage}
                />
              </Pressable>
            );
          }}
        />

        {/* ③ Divider */}
        <View
          style={[
            styles.divider,
            {
              backgroundColor: t.color.borderSubtle,
              marginHorizontal: t.space[4],
              marginBottom: t.space[2],
            },
          ]}
        />

        {/* ④ Menu items */}
        <View style={{ paddingHorizontal: t.space[0] }}>
          {MENU_ITEMS.map((item) => (
            <Pressable
              key={item.key}
              onPress={() => {
                if (item.implemented) {
                  onAction?.(item.key);
                  handleClose();
                } else {
                  Alert.alert('即将推出', `「${item.label}」功能正在开发中`);
                }
              }}
              style={({ pressed }) => [
                styles.menuItem,
                {
                  backgroundColor: pressed
                    ? t.color.surfaceElevated
                    : 'transparent',
                  borderRadius: t.radius.md,
                  paddingVertical: t.space[3],
                  paddingHorizontal: t.space[4],
                },
              ]}
            >
              <View
                style={[
                  styles.menuIcon,
                  {
                    backgroundColor: t.color.surfaceElevated,
                    borderRadius: t.radius.md,
                  },
                ]}
              >
                <Ionicons
                  name={item.icon}
                  size={22}
                  color={t.color.textSecondary}
                />
              </View>
              <View style={styles.menuText}>
                <Text variant="label">{item.label}</Text>
                <Text variant="caption" tone="muted">
                  {item.subtitle}
                </Text>
              </View>
              {!item.implemented && (
                <View
                  style={[
                    styles.badge,
                    {
                      backgroundColor: t.color.surfaceElevated,
                      borderRadius: t.radius.full,
                    },
                  ]}
                >
                  <Text
                    variant="caption"
                    tone="muted"
                    style={{ fontSize: 10 }}
                  >
                    即将推出
                  </Text>
                </View>
              )}
            </Pressable>
          ))}
        </View>
      </Animated.View>
    </Modal>
  );
}

/* ---------- Styles ---------- */

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
  },
  backdropFill: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#000',
  },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
  },
  handleRow: {
    alignItems: 'center',
    paddingTop: 10,
    paddingBottom: 6,
  },
  handle: {
    width: 36,
    height: 4,
    borderRadius: 2,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 4,
  },
  thumbBox: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbImage: {
    width: THUMB_SIZE,
    height: THUMB_SIZE,
    resizeMode: 'cover',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  menuIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
  },
});
