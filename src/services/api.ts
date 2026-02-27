// MongoDB API service for Job Claimer app - Persistent Storage Ready
const API_BASE = import.meta.env.VITE_API_BASE_URL || '';

export interface Job {
  id: string;
  title: string;
  description: string;
  scope: string;
  fee: number;
  deadline: string;
  status: 'open' | 'claimed' | 'in-progress' | 'completed' | 'cancelled';
  priority: 'low' | 'medium' | 'high';
  category: string;
  claimedBy?: string | { id: string; name: string; email: string };
  claimedAt?: string;
  createdAt: string;
  createdBy: string | { id: string; name: string; email: string };
  submissionFile?: {
    filename: string;
    originalName: string;
    uploadedAt: string;
    uploadedBy?: { id: string; name: string; email: string };
  };
}

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'member';
}

export interface JobFilter {
  status?: JobStatus | 'all';
  category?: string;
  priority?: string;
  search?: string;
}

export type JobStatus = Job['status'];

export interface CreateJobData {
  title: string;
  description: string;
  scope: string;
  fee: number;
  deadline: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
}

export interface UpdateJobData extends Partial<CreateJobData> {}

export interface CreateUserData {
  name: string;
  email: string;
  password: string;
  role?: 'admin' | 'member';
}

export interface UpdateUserData extends Partial<CreateUserData> {}

class MongoDBAPI {
  private baseURL: string;

  constructor(baseURL?: string) {
    this.baseURL = baseURL || API_BASE;
  }

  // Generic request helper
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseURL}${endpoint}`;
    
    const defaultHeaders: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    // Add auth token if available
    const token = localStorage.getItem('authToken');
    if (token) {
      defaultHeaders['Authorization'] = `Bearer ${token}`;
    }

    console.log(`MongoDB API Request: ${options.method || 'GET'} ${endpoint}`, {
      url,
      headers: defaultHeaders,
      body: options.body,
    });

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    console.log(`MongoDB API Response: ${response.status} ${endpoint}`);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      console.error('MongoDB API Error:', error);
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  // Authentication
  async login(email: string, password: string): Promise<User> {
    const response = await this.request<{ id: string; name: string; email: string; role: string; token: string }>('/users/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });

    // Store auth token
    localStorage.setItem('authToken', response.token);
    
    return {
      id: response.id,
      name: response.name,
      email: response.email,
      role: response.role as 'admin' | 'member',
    };
  }

  async logout(): Promise<void> {
    localStorage.removeItem('authToken');
  }

  async getCurrentUser(): Promise<User | null> {
    try {
      return await this.request<User>('/users/me');
    } catch {
      return null;
    }
  }

  // Registration
  async registerUser(userData: CreateUserData): Promise<User> {
    const response = await this.request<{ id: string; name: string; email: string; role: string; token: string }>('/users/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    // Store auth token
    localStorage.setItem('authToken', response.token);
    
    return {
      id: response.id,
      name: response.name,
      email: response.email,
      role: response.role as 'admin' | 'member',
    };
  }

  // Jobs
  async getJobs(filters?: {
    status?: string;
    category?: string;
    priority?: string;
    search?: string;
  }): Promise<Job[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.append('status', filters.status);
    if (filters?.category) params.append('category', filters.category);
    if (filters?.priority) params.append('priority', filters.priority);
    if (filters?.search) params.append('search', filters.search);

    const endpoint = params.toString() ? `/jobs?${params.toString()}` : '/jobs';
    return this.request<Job[]>(endpoint);
  }

  async getJob(id: string): Promise<Job> {
    return this.request<Job>(`/jobs/${id}`);
  }

  async createJob(jobData: CreateJobData): Promise<Job> {
    const response = await this.request<Job>('/jobs', {
      method: 'POST',
      body: JSON.stringify(jobData),
    });

    return response;
  }

  async updateJob(id: string, jobData: UpdateJobData): Promise<Job> {
    const response = await this.request<Job>(`/jobs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(jobData),
    });

    return response;
  }

  async deleteJob(id: string): Promise<void> {
    await this.request(`/jobs/${id}`, {
      method: 'DELETE',
    });
  }

  async claimJob(id: string): Promise<void> {
    await this.request(`/jobs/${id}/claim`, {
      method: 'POST',
    });
  }

  async updateJobStatus(id: string, status: JobStatus): Promise<void> {
    await this.request(`/jobs/${id}/status`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    });
  }

  async submitPDF(id: string, file: File): Promise<{ message: string; submissionFile: any }> {
    const formData = new FormData();
    formData.append('submission', file);
    
    const response = await fetch(`${this.baseURL}/jobs/${id}/submit`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Unknown error' }));
      throw new Error(error.message || 'API request failed');
    }

    return response.json();
  }

  async downloadPDF(id: string): Promise<void> {
    const response = await fetch(`${this.baseURL}/jobs/${id}/download`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
      },
    });

    if (!response.ok) {
      throw new Error('Failed to download PDF');
    }

    const blob = await response.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `submission-${id}.pdf`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  }

  // Users (admin only)
  async getUsers(): Promise<User[]> {
    return this.request<User[]>('/users');
  }

  async createUser(userData: CreateUserData): Promise<User> {
    const response = await this.request<User>('/users/register', {
      method: 'POST',
      body: JSON.stringify(userData),
    });

    return response;
  }

  async updateUser(id: string, userData: UpdateUserData): Promise<User> {
    const response = await this.request<User>(`/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(userData),
    });

    return response;
  }

  async deleteUser(id: string): Promise<void> {
    await this.request(`/users/${id}`, {
      method: 'DELETE',
    });
  }
}

// Export singleton instance
export const api = new MongoDBAPI();

// Export class for custom instances
export { MongoDBAPI };
