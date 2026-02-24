export interface RegisterBody {
  email: string;
  password: string;
  fullName?: string;
  restaurantName: string;
}

export interface LoginBody {
  email: string;
  password: string;
}