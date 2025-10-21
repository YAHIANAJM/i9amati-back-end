import { randomUUID } from "crypto";

// Simple storage interface
export class MemStorage {
  constructor() {
    this.users = new Map();
    this.payments = new Map();
    this.votes = new Map();
    this.complaints = new Map();
  }

  // User methods
  async getUser(id) {
    return this.users.get(id);
  }

  async getUserByUsername(username) {
    return Array.from(this.users.values()).find(
      (user) => user.username === username,
    );
  }

  async createUser(insertUser) {
    const id = randomUUID();
    const user = { ...insertUser, id };
    this.users.set(id, user);
    return user;
  }

  // Payment methods
  async getPayments(userId) {
    return Array.from(this.payments.values()).filter(
      (payment) => payment.userId === userId
    );
  }

  async createPayment(payment) {
    const id = randomUUID();
    const newPayment = { ...payment, id };
    this.payments.set(id, newPayment);
    return newPayment;
  }

  // Vote methods
  async getVotes() {
    return Array.from(this.votes.values());
  }

  async createVote(vote) {
    const id = randomUUID();
    const newVote = { ...vote, id };
    this.votes.set(id, newVote);
    return newVote;
  }

  // Complaint methods
  async getComplaints(userId) {
    return Array.from(this.complaints.values()).filter(
      (complaint) => complaint.userId === userId
    );
  }

  async createComplaint(complaint) {
    const id = randomUUID();
    const newComplaint = { ...complaint, id };
    this.complaints.set(id, newComplaint);
    return newComplaint;
  }
}

export const storage = new MemStorage();
