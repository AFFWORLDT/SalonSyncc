import 'package:flutter/material.dart';

import 'core/theme/app_theme.dart';
import 'core/theme/tokens.dart';

void main() => runApp(const SalonKitApp());

class SalonKitApp extends StatelessWidget {
  const SalonKitApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'SalonKit',
        debugShowCheckedModeBanner: false,
        theme: buildTheme(SkTokens.light, Brightness.light),
        darkTheme: buildTheme(SkTokens.dark, Brightness.dark),
        home: const Scaffold(body: Center(child: Text('SalonKit'))),
      );
}
