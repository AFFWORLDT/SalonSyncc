import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/material.dart';

import '../config.dart';

/// The salon's uploaded logo, or a tile with its initials when it has none (or it fails to load).
class SalonLogo extends StatelessWidget {
  const SalonLogo({super.key, required this.slug, required this.name, this.logoUrl, this.size = 72});
  final String slug, name;
  final String? logoUrl;
  final double size;

  @override
  Widget build(BuildContext context) {
    final c = Theme.of(context).colorScheme;
    final initials = name.trim().split(RegExp(r'\s+')).where((w) => w.isNotEmpty).take(2).map((w) => w[0].toUpperCase()).join();
    final tile = Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: c.primary, borderRadius: BorderRadius.circular(size * 0.28)),
      child: Text(initials.isEmpty ? '?' : initials, style: TextStyle(color: c.onPrimary, fontSize: size * 0.36, fontWeight: FontWeight.w600)),
    );
    if (logoUrl == null) return tile;
    return ClipRRect(
      borderRadius: BorderRadius.circular(size * 0.28),
      child: CachedNetworkImage(
        imageUrl: absolute(salonBase(slug), logoUrl!).toString(),
        width: size,
        height: size,
        fit: BoxFit.cover,
        placeholder: (_, _) => SizedBox(width: size, height: size),
        errorWidget: (_, _, _) => tile,
      ),
    );
  }
}
