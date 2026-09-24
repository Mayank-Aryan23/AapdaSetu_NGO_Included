import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/supabase_client.dart';
import 'login_screen.dart';
import 'requests_screen.dart';

import 'reports_screen.dart';


class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {

  final TextEditingController _middlemanEmailController =
      TextEditingController();

  //  FETCH USER FROM SUPABASE
 Future<Map<String, dynamic>?> getUser() async {
  final user = AuthService.currentUser;
  if (user == null) return null;

  try {
    final res = await supabase
        .from('profiles')
        .select()
        .eq('id', user.id)
        .maybeSingle(); // ✅ SAFE

    if (res == null) {
      print("⚠️ No profile found for user");
      return null;
    }

    return res;

  } catch (e) {
    print("❌ PROFILE FETCH ERROR: $e");
    return null;
  }
}

  Future<int> getMyReportCount() async {
  final user = supabase.auth.currentUser;

  if (user == null) return 0;

  final res = await supabase
      .from('citizen_reports')
      .select('id')
      .eq('created_by', user.id); 

  return res.length;
}
  

  //  EDIT PROFILE
  void _showEditDialog(Map<String, dynamic> data) {
    final nameController = TextEditingController(text: data['name']);
    final ageController =
        TextEditingController(text: data['age']?.toString());

    showDialog(
      context: context,
      builder: (_) {
        return AlertDialog(
          title: const Text("Edit Profile"),
          content: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              TextField(
                controller: nameController,
                decoration: const InputDecoration(labelText: "Name"),
              ),
              TextField(
                controller: ageController,
                keyboardType: TextInputType.number,
                decoration: const InputDecoration(labelText: "Age"),
              ),
            ],
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context),
              child: const Text("Cancel"),
            ),
            ElevatedButton(
              onPressed: () async {
                await supabase.from('profiles').update({
                  'name': nameController.text.trim(),
                  'age': int.tryParse(ageController.text.trim()),
                }).eq('id', AuthService.currentUser!.id);

                if (!mounted) return;

                Navigator.pop(context);
                setState(() {});

                ScaffoldMessenger.of(context).showSnackBar(
                  const SnackBar(content: Text("Profile updated")),
                );
              },
              child: const Text("Save"),
            ),
          ],
        );
      },
    );
  }

  //  SEND MIDDLEMAN REQUEST
  Future<void> sendRequest() async {
  final email = _middlemanEmailController.text.trim();
  if (email.isEmpty) return;

  try {
    final user = supabase.auth.currentUser;
    if (user == null) throw "Not logged in";

    // 🔍 find target (middleman)
    final target = await supabase
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle();

    if (target == null) throw "User not found";

    // 🔍 get my citizen_id
    final myProfile = await supabase
        .from('profiles')
        .select('citizen_id')
        .eq('id', user.id)
        .single();

    await supabase.from('middleman_links').insert({
      'citizen_id': myProfile['citizen_id'],
      'middleman_id': target['id'], 
      'status': 'Pending',
    });

    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text("Request sent")),
    );

    _middlemanEmailController.clear();

  } catch (e) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text("$e")),
    );
  }
}

  //  FETCH LINKED MIDDLEMAN
 Future<Map<String, dynamic>> getLinkedUsers() async {
  final user = supabase.auth.currentUser;
  if (user == null) return {};

  final myProfile = await supabase
      .from('profiles')
      .select('citizen_id')
      .eq('id', user.id)
      .single();

  final myId = myProfile['citizen_id'];

  // MY MIDDLEMEN
  final myMiddlemenLinks = await supabase
      .from('middleman_links')
      .select('middleman_id')
      .eq('citizen_id', myId)
      .eq('status', 'Accepted');

  final middlemanIds =
      myMiddlemenLinks.map((e) => e['middleman_id']).toList();

  final middlemen = middlemanIds.isEmpty
      ? []
      : await supabase
          .from('profiles')
          .select('name')
          .inFilter('id', middlemanIds);

  // PEOPLE I HELP
  final helpingLinks = await supabase
      .from('middleman_links')
      .select('citizen_id')
      .eq('middleman_id', user.id)
      .eq('status', 'Accepted');

  final citizenIds =
      helpingLinks.map((e) => e['citizen_id']).toList();

  final citizens = citizenIds.isEmpty
      ? []
      : await supabase
          .from('profiles')
          .select('name')
          .inFilter('citizen_id', citizenIds);

  return {
    'middlemen': middlemen,
    'citizens': citizens,
  };
}

  @override
  void dispose() {
    _middlemanEmailController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.grey[100],
      appBar: AppBar(
        title: const Text("Profile"),
        actions: [
          IconButton(
            icon: const Icon(Icons.notifications),
            onPressed: () {
              Navigator.push(
                context,
                MaterialPageRoute(
                  builder: (_) => const RequestsScreen(),
                ),
              );
            },
          )
        ],
      ),
      body: SafeArea(
        child: FutureBuilder(
          future: getUser(),
          builder: (context, snapshot) {

            if (!snapshot.hasData) {
              return const Center(child: CircularProgressIndicator());
            }

            final data = snapshot.data!;

            return SingleChildScrollView(
              padding: const EdgeInsets.fromLTRB(16, 20, 16, 100),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
               children: [

  // PROFILE CARD
  Container(
    padding: const EdgeInsets.all(16),
    margin: const EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      children: [
        Text(data["name"] ?? "No Name",
          style: const TextStyle(
              fontSize: 22, fontWeight: FontWeight.bold),
        ),
        const SizedBox(height: 4),
        Text("Age: ${data["age"] ?? "--"}"),

        const SizedBox(height: 10),

        ElevatedButton(
          onPressed: () => _showEditDialog(data),
          child: const Text("Edit Profile"),
        ),
      ],
    ),
  ),

  // MIDDLEMAN SECTION
  Container(
    padding: const EdgeInsets.all(16),
    margin: const EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [

        const Text("Middleman",
            style: TextStyle(fontWeight: FontWeight.w600)),

        const SizedBox(height: 10),

        TextField(
          controller: _middlemanEmailController,
          decoration: const InputDecoration(
            hintText: "Enter email",
            border: OutlineInputBorder(),
          ),
        ),

        const SizedBox(height: 10),

        ElevatedButton(
          onPressed: sendRequest,
          child: const Text("Send Request"),
        ),

        const SizedBox(height: 10),

        ElevatedButton(
          onPressed: () {
            Navigator.push(
              context,
              MaterialPageRoute(
                builder: (_) => const RequestsScreen(),
              ),
            );
          },
          child: const Text("View Requests"),
        ),

        const SizedBox(height: 12),

        // LINKED USER
        FutureBuilder(
  future: getLinkedUsers(),
  builder: (context, snap) {

    if (!snap.hasData) return const Text("Loading...");

    final data = snap.data!;

    final middlemen = data['middlemen'] as List;
    final citizens = data['citizens'] as List;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [

        if (middlemen.isNotEmpty) ...[
          const Text("Your Middlemen:"),
          ...middlemen.map((m) => Text("• ${m['name']}")),
        ],

        if (citizens.isNotEmpty) ...[
          const SizedBox(height: 10),
          const Text("People You Help:"),
          ...citizens.map((c) => Text("• ${c['name']}")),
        ],
      ],
    );
  },
),
      ],
    ),
  ),

  // MY REPORTS (SEPARATE SECTION)
  Container(
    padding: const EdgeInsets.all(16),
    margin: const EdgeInsets.only(bottom: 16),
    decoration: BoxDecoration(
      color: Colors.white,
      borderRadius: BorderRadius.circular(16),
    ),
    child: Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [

        const Text(
          "My Reports",
          style: TextStyle(fontWeight: FontWeight.w600),
        ),

        const SizedBox(height: 8),

        FutureBuilder<int>(
          future: getMyReportCount(),
          builder: (context, snapshot) {

            if (!snapshot.hasData) {
              return const Text("Loading...");
            }

            final count = snapshot.data!;

            return Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [

                Text("$count reports submitted"),

                TextButton(
                  onPressed: () {
                    Navigator.push(
                      context,
                      MaterialPageRoute(
                        builder: (_) => const ReportsScreen(),
                      ),
                    );
                  },
                  child: const Text("View All"),
                ),
              ],
            );
          },
        ),
      ],
    ),
  ),

  // LOGOUT
  ElevatedButton(
    onPressed: () async {
      await AuthService.logout();

      Navigator.pushAndRemoveUntil(
        context,
        MaterialPageRoute(
            builder: (_) => const LoginScreen()),
        (route) => false,
      );
    },
    child: const Text("Logout"),
  ),
],
              ),
            );
          },
        ),
      ),
    );
  }
}