import 'package:flutter/material.dart';

/// A chip that shows the current choice and opens a menu of the others (a phone-sized <select>).
class ChipMenu<T> extends StatelessWidget {
  const ChipMenu({super.key, required this.value, required this.items, required this.onChanged, this.icon});
  final T value;
  final List<(T, String)> items;
  final ValueChanged<T> onChanged;
  final IconData? icon;

  @override
  Widget build(BuildContext context) {
    final label = items.firstWhere((x) => x.$1 == value, orElse: () => items.first).$2;
    return PopupMenuButton<T>(
      initialValue: value,
      onSelected: onChanged,
      itemBuilder: (_) => [for (final (v, l) in items) PopupMenuItem(value: v, child: Text(l))],
      child: Chip(
        avatar: icon == null ? null : Icon(icon, size: 18),
        label: Row(mainAxisSize: MainAxisSize.min, children: [Text(label), const Icon(Icons.arrow_drop_down_rounded, size: 20)]),
      ),
    );
  }
}
