import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';

/// A person: always a circle. Their photo, or their initials on a colour picked from the name (so each barber keeps
/// the same colour everywhere).
class SkAvatar extends StatelessWidget {
  const SkAvatar({super.key, required this.slug, required this.name, this.url, this.size = 40});
  final String slug, name;
  final String? url;
  final double size;

  static const _tints = [
    Color(0xFF1F7A6A), Color(0xFF8A5A2B), Color(0xFF4A5BA8), Color(0xFF9C3D5A),
    Color(0xFF3D7A2E), Color(0xFF7A4AA0), Color(0xFF2B6E8A), Color(0xFFA0522D),
  ];

  static Color tintFor(String name) {
    var h = 0;
    for (final c in name.trim().toLowerCase().codeUnits) {
      h = (h * 31 + c) & 0x7fffffff;
    }
    return _tints[h % _tints.length];
  }

  static String initialsOf(String name) {
    final parts = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).toList();
    if (parts.isEmpty) return '?';
    return parts.take(2).map((w) => w[0].toUpperCase()).join();
  }

  @override
  Widget build(BuildContext context) {
    final initials = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: tintFor(name), shape: BoxShape.circle),
      child: Text(initialsOf(name), style: TextStyle(color: Colors.white, fontSize: size * 0.38, fontWeight: FontWeight.w600)),
    );
    if (url == null) return initials;
    return ClipOval(
      child: CachedNetworkImage(
        imageUrl: absolute(salonBase(slug), url!).toString(),
        width: size,
        height: size,
        fit: BoxFit.cover,
        fadeInDuration: const Duration(milliseconds: 120),
        placeholder: (_, _) => initials,
        errorWidget: (_, _, _) => initials,
      ),
    );
  }
}
