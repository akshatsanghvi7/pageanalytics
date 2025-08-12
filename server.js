const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server, { cors: { origin: '*' } }); // Allow CORS for your site
const mongoose = require('mongoose');
const geoip = require('geoip-lite');

// Connect to MongoDB (replace with your Atlas URI)
mongoose.connect('mongodb+srv://kingsanghvi:6aq@qZcwp3Z5xAy@landingpage.rydonfg.mongodb.net/?retryWrites=true&w=majority&appName=landingpage', { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Visit schema
const visitSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  ip: String,
  region: String,
  page: String
});
const Visit = mongoose.model('Visit', visitSchema);

// Track live viewers
let liveViewers = 0;

// Socket.io for real-time
io.on('connection', (socket) => {
  liveViewers++;
  io.emit('liveUpdate', liveViewers); // Broadcast live count to dashboard

  const ip = socket.handshake.address.replace('::ffff:', ''); // Clean IP
  const geo = geoip.lookup(ip);
  const region = geo ? geo.country : 'Unknown';

  // Client sends 'visit' event on load
  socket.on('visit', (data) => {
    const visit = new Visit({
      ip,
      region,
      page: data.page
    });
    visit.save().catch(err => console.error('Save error:', err));
  });

  socket.on('disconnect', () => {
    liveViewers--;
    io.emit('liveUpdate', liveViewers);
  });
});

// API endpoint for historical stats
app.get('/stats', async (req, res) => {
  try {
    const now = new Date();
    const startOfToday = new Date(now.setHours(0, 0, 0, 0));
    const startOfYesterday = new Date(startOfToday);
    startOfYesterday.setDate(startOfYesterday.getDate() - 1);
    const startOfWeek = new Date(startOfToday);
    startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Total viewers (all visits)
    const totalViewers = await Visit.countDocuments();

    // Unique viewers (distinct IPs)
    const uniqueViewers = (await Visit.distinct('ip')).length;

    // Viewers today
    const todayViewers = await Visit.countDocuments({ timestamp: { $gte: startOfToday } });

    // Viewers yesterday
    const yesterdayViewers = await Visit.countDocuments({
      timestamp: { $gte: startOfYesterday, $lt: startOfToday }
    });

    // Viewers this week
    const weekViewers = await Visit.countDocuments({ timestamp: { $gte: startOfWeek } });

    // Viewers this month
    const monthViewers = await Visit.countDocuments({ timestamp: { $gte: startOfMonth } });

    // Regions (grouped counts)
    const regions = await Visit.aggregate([
      { $group: { _id: '$region', count: { $sum: 1 } } }
    ]);

    // Pages visited (grouped counts)
    const pages = await Visit.aggregate([
      { $group: { _id: '$page', count: { $sum: 1 } } }
    ]);

    res.json({
      liveViewers, // Current live from socket
      totalViewers,
      uniqueViewers,
      todayViewers,
      yesterdayViewers,
      weekViewers,
      monthViewers,
      regions: regions.map(r => ({ region: r._id, count: r.count })),
      pages: pages.map(p => ({ page: p._id, count: p.count }))
    });
  } catch (err) {
    res.status(500).json({ error: 'Error fetching stats' });
  }
});

// Serve the dashboard HTML (separate page)
app.get('/dashboard', (req, res) => {
  res.sendFile(__dirname + '/dashboard.html');
});

// Start server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Server running on port ${PORT}`));