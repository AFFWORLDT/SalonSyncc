import 'package:flutter/material.dart';
import 'package:get/get.dart';

import '../../core/auth/auth_controller.dart';
import '../../core/features/feature_module.dart';
import '../../data/announcements_api.dart';
import '../../data/notices_api.dart';
import '../../data/staff_api.dart';
import '../../models/role.dart';
import 'announcements_screen.dart';
import 'send_screen.dart';

/// Unread notifications (announcements, "your sale was changed", …): the red count on the top bar's bell.
final noticesUnread = ValueNotifier<int>(0);

Future<void> refreshNoticesUnread() async {
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
  builder: (_) {
    final auth = Get.find<AuthController>();
    return AnnouncementsScreen(me: auth.me.value!, api: NoticesApi(auth.api), unread: noticesUnread);
  },
);

/// Admins write announcements to the team (a push to their phones) and see what was sent.
final sendAnnouncementsModule = FeatureModule(
  id: 'send_announcements',
  featureKey: 'announcements',
  roles: {Role.admin},
  title: 'Announcements',
  icon: Icons.campaign_outlined,
  order: 65,
  builder: (_) {
    final auth = Get.find<AuthController>();
    return SendAnnouncementScreen(me: auth.me.value!, api: AnnouncementsApi(auth.api), staff: StaffApi(auth.api));
  },
);
