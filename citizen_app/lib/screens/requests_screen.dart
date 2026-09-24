import 'package:flutter/material.dart';
import '../services/supabase_client.dart';
import '../services/auth_service.dart';

class RequestsScreen extends StatefulWidget {
  const RequestsScreen({super.key});

  @override
  State<RequestsScreen> createState() => _RequestsScreenState();
}

class _RequestsScreenState extends State<RequestsScreen> {

  //  FETCH REQUESTS
 Future<List<dynamic>> getRequests() async {
  final user = supabase.auth.currentUser;
  if (user == null) return [];

  final res = await supabase
      .from('middleman_links')
      .select('id, citizen_id')
      .eq('middleman_id', user.id)
      .eq('status', 'Pending');

  return res;
}

  //  ACCEPT
  Future<void> acceptRequest(int id) async {
    await supabase
        .from('middleman_links')
        .update({'status': 'Accepted'})
        .eq('id', id);

    setState(() {});
  }

  //  REJECT
  Future<void> rejectRequest(int id) async {
    await supabase
        .from('middleman_links')
        .update({'status': 'Rejected'})
        .eq('id', id);

    setState(() {});
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text("Requests")),
      body: FutureBuilder(
        future: getRequests(),
        builder: (context, snapshot) {

          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final requests = snapshot.data as List;

          if (requests.isEmpty) {
            return const Center(child: Text("No requests"));
          }

          return ListView(
            children: requests.map((req) {

              return FutureBuilder(
  future: supabase
      .from('profiles')
      .select('name')
      .eq('citizen_id', req['citizen_id'])
      .single(),
  builder: (context, snap) {

    if (!snap.hasData) {
      return const ListTile(title: Text("Loading..."));
    }

    final citizen = snap.data as Map<String, dynamic>;

    return ListTile(
      title: Text(citizen['name']), // ✅ REAL NAME
      subtitle: const Text("Wants you as middleman"),

      trailing: Row(
        mainAxisSize: MainAxisSize.min,
        children: [

          IconButton(
            icon: const Icon(Icons.check, color: Colors.green),
            onPressed: () => acceptRequest(req['id']),
          ),

          IconButton(
            icon: const Icon(Icons.close, color: Colors.red),
            onPressed: () => rejectRequest(req['id']),
          ),
        ],
      ),
    );
  },
);
            }).toList(),
          );
        },
      ),
    );
  }
}