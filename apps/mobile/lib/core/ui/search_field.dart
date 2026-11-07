import 'package:flutter/material.dart';

import '../theme/scale.dart';

/// The app's search box: a filled pill with a search icon and a ✕ once something is typed.
class SkSearchField extends StatefulWidget {
  const SkSearchField({super.key, required this.controller, required this.hint, this.onChanged});
  final TextEditingController controller;
  final String hint;
  final ValueChanged<String>? onChanged;

  @override
  State<SkSearchField> createState() => _SkSearchFieldState();
}

class _SkSearchFieldState extends State<SkSearchField> {
  @override
  void initState() {
    super.initState();
    widget.controller.addListener(_changed);
  }

  @override
  void dispose() {
    widget.controller.removeListener(_changed);
    super.dispose();
  }

  void _changed() {
    if (mounted) setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    final cs = Theme.of(context).colorScheme;
    final border = OutlineInputBorder(borderRadius: BorderRadius.circular(SkRadius.xl), borderSide: BorderSide(color: cs.outlineVariant.withValues(alpha: 0.6)));
    return TextField(
      controller: widget.controller,
      onChanged: widget.onChanged,
      textInputAction: TextInputAction.search,
      decoration: InputDecoration(
        hintText: widget.hint,
        prefixIcon: const Icon(Icons.search_rounded),
        suffixIcon: widget.controller.text.isEmpty
            ? null
            : IconButton(
                tooltip: 'Clear',
                onPressed: () {
                  widget.controller.clear();
                  widget.onChanged?.call('');
                },
                icon: const Icon(Icons.close_rounded, size: 20),
              ),
        filled: true,
        fillColor: cs.surfaceContainerHighest.withValues(alpha: 0.5),
        isDense: true,
        contentPadding: const EdgeInsets.symmetric(vertical: 12),
        border: border,
        enabledBorder: border,
        focusedBorder: border.copyWith(borderSide: BorderSide(color: cs.primary, width: 1.5)),
      ),
    );
  }
}
