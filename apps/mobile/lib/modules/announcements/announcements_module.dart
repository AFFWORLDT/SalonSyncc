import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/notices_api.dart';
import '../../models/role.dart';
import 'announcements_screen.dart';

/// Unread announcements and updates, shown on the "More" tab.
final noticesUnread = ValueNotifier<int>(0);

Future<void> _refreshUnread() async {
  final auth = Get.find<AuthController>();
  noticesUnread.value = (await NoticesApi(auth.api).list()).unread;
}

/// Announcements for barbers arrive as the notification feed (the web's bell), so they follow the `push` switch.
final announcementsModule = FeatureModule(
  id: 'announcements',
  featureKey: 'push',
  roles: {Role.barber},
  title: 'Announcements',
  icon: Icons.campaign_outlined,
  order: 30,
  badge: noticesUnread,
  onRefresh: _refreshUnread,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return AnnouncementsScreen(me: auth.me.value!, api: NoticesApi(auth.api), unread: noticesUnread);
  },
);
