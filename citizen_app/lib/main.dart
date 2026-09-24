import 'package:flutter/material.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:supabase_flutter/supabase_flutter.dart';
import 'package:connectivity_plus/connectivity_plus.dart';

import 'screens/login_screen.dart';
import 'widgets/bottom_nav.dart';
import 'services/supabase_client.dart';

//  SYNC FUNCTION
Future<void> syncOfflineReports() async {
  final box = Hive.box('reports');

  for (var key in box.keys) {
    final report = box.get(key);

    if (report['synced'] == false) {
      try {
        await supabase.from('citizen_reports').insert({
          'category': report['category'],
          'details': report['details'],
          'latitude': report['latitude'],
          'longitude': report['longitude'],
          'reported_for': report['reported_for'],
          'created_by': report['created_by'],
        });

        report['synced'] = true;
        await box.put(key, report);

      } catch (_) {}
    }
  }
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  await Supabase.initialize(
    url: 'https://cphqdgqtrosaxosdwdrz.supabase.co',
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNwaHFkZ3F0cm9zYXhvc2R3ZHJ6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjM3MjU4NDQsImV4cCI6MjA3OTMwMTg0NH0.CGhmghdxQaPpD6uxDjaoAmnhZZsOKiiwacNw-ZrpDQc',
  );

  await Hive.initFlutter();
  await Hive.openBox('reports');
  await Hive.openBox('chat');
  await Hive.openBox('profile');

  //  AUTO SYNC
  Connectivity().onConnectivityChanged.listen((event) {
    if (event != ConnectivityResult.none) {
      syncOfflineReports();
    }
  });

  runApp(const AapdaApp());
}

class AapdaApp extends StatelessWidget {
  const AapdaApp({super.key});

  @override
  Widget build(BuildContext context) {
    final user = Supabase.instance.client.auth.currentUser;

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      home: user != null
          ? const MainNavigation()
          : const LoginScreen(),
    );
  }
}