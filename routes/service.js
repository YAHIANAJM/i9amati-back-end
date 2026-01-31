import express from 'express';
import Service from '../models/Service.js';
import { auth } from '../middleware/auth.js';

const router = express.Router();

router.use((req, res, next) => {
    console.log(`Service Router received: ${req.method} ${req.url}`);
    next();
});

// Debug ping
router.get('/ping', (req, res) => res.json({ message: 'service router reachable' }));

// Update a specific task status - Higher priority
router.patch('/:id/tasks/:taskId', async (req, res) => {
  try {
    const { status } = req.body;
    console.log('PATCH task status request:', { serviceId: req.params.id, taskId: req.params.taskId, status });
    
    if (!['pending', 'completed'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }

    const service = await Service.findById(req.params.id);
    if (!service) {
      console.log('Service not found for ID:', req.params.id);
      return res.status(404).json({ error: `Backend: Service ID ${req.params.id} not found in DB` });
    }

    const { taskIdx } = req.query;
    let taskFound = false;
    
    // 1. Try matching by ID (First Priority)
    for (const schedule of service.schedules) {
      for (const task of schedule.tasks) {
        if (task._id && String(task._id) === String(req.params.taskId)) {
          task.status = status;
          taskFound = true;
          break;
        }
      }
      if (taskFound) break;
    }

    // 2. Try matching by Text Content (Second Priority - for legacy data)
    if (!taskFound) {
       for (const schedule of service.schedules) {
         for (const task of schedule.tasks) {
           // Basic text reconstruction for spread-string objects
           const getTaskText = (t) => {
               if (typeof t === 'string') return t;
               if (t.text) return t.text;
               const keys = Object.keys(t).filter(k => !isNaN(k)).sort((a,b) => parseInt(a) - parseInt(b));
               if (keys.length > 0) return keys.map(k => t[k]).join('');
               return '';
           };
           
           if (req.params.taskId === getTaskText(task)) {
             task.status = status;
             taskFound = true;
             break;
           }
         }
         if (taskFound) break;
       }
    }

    if (!taskFound) {
      console.log('Task not found in service schedules. Looking for:', req.params.taskId);
      return res.status(404).json({ error: `Backend: Task not found. Provided ID/Text: ${req.params.taskId}` });
    }

    await service.save();
    console.log('Task status updated successfully');
    res.json({ message: 'Status updated', status });
  } catch (err) {
    console.error('PATCH Task Status Error:', err);
    res.status(500).json({ error: err.message });
  }
});

// List services (optionally filter by status/type)
router.get('/', auth, async (req, res) => {
  const { status, type } = req.query;
  const query = {};
  if (status) query.status = status.toUpperCase();
  if (type) query.type = type.toUpperCase();
  const services = await Service.find(query).sort({ _id: -1 });
  res.json(services);
});

// Get a single service by ID
// Publicly accessible for workers
router.get('/:id', async (req, res) => {
  try {
    const service = await Service.findById(req.params.id);
    if (!service) return res.status(404).json({ error: 'Service not found' });
    res.json(service);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Create a new service contract
router.post('/', auth, async (req, res) => {
  try {
    const { title, type, provider, contract, status } = req.body;
    
    // Basic validation
    if (!title || !provider?.name || !type) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const newService = new Service({
      residence_id: req.user.residence_id || '000000000000000000000000', // Fallback for testing if not set
      title,
      type,
      provider,
      contract,
      status: status || 'ACTIVE'
    });

    const savedService = await newService.save();
    res.status(201).json(savedService);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Update a service
router.put('/:id', auth, async (req, res) => {
  try {
    const { title, type, provider, contract, status, schedules } = req.body;
    const update = {};
    if (title) update.title = title;
    if (type) update.type = type;
    if (provider) update.provider = provider;
    if (contract) update.contract = contract;
    if (status) update.status = status;
    if (schedules) update.schedules = schedules;

    const svc = await Service.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!svc) return res.status(404).json({ error: 'Service not found' });
    res.json(svc);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;


