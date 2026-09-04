export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      cart_items: {
        Row: {
          created_at: string
          id: string
          image: string
          price: number
          product_id: number
          product_name: string
          product_name_hi: string
          quantity: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image: string
          price: number
          product_id: number
          product_name: string
          product_name_hi: string
          quantity?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image?: string
          price?: number
          product_id?: number
          product_name?: string
          product_name_hi?: string
          quantity?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      orders: {
        Row: {
          assigned_partner: string | null
          created_at: string
          delivery_address: string | null
          gps_lat: number | null
          gps_lng: number | null
          id: string
          items: Json
          order_number: string
          phone_number: string | null
          status: string
          total_amount: number
          updated_at: string
          user_id: string
        }
        Insert: {
          assigned_partner?: string | null
          created_at?: string
          delivery_address?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          items: Json
          order_number: string
          phone_number?: string | null
          status?: string
          total_amount: number
          updated_at?: string
          user_id: string
        }
        Update: {
          assigned_partner?: string | null
          created_at?: string
          delivery_address?: string | null
          gps_lat?: number | null
          gps_lng?: number | null
          id?: string
          items?: Json
          order_number?: string
          phone_number?: string | null
          status?: string
          total_amount?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      partners: {
        Row: {
          created_at: string
          full_name: string
          id: string
          is_active: boolean | null
          phone_number: string | null
          updated_at: string
          user_id: string
          vehicle_type: string | null
        }
        Insert: {
          created_at?: string
          full_name: string
          id?: string
          is_active?: boolean | null
          phone_number?: string | null
          updated_at?: string
          user_id: string
          vehicle_type?: string | null
        }
        Update: {
          created_at?: string
          full_name?: string
          id?: string
          is_active?: boolean | null
          phone_number?: string | null
          updated_at?: string
          user_id?: string
          vehicle_type?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          updated_at: string
          username: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          updated_at?: string
          username?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          updated_at?: string
          username?: string | null
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      get_partner_orders: {
        Args: never
        Returns: {
          assigned_partner: string
          created_at: string
          delivery_address: string
          gps_lat: number
          gps_lng: number
          id: string
          items: Json
          order_number: string
          phone_number: string
          status: string
          total_amount: number
        }[]
      }
      is_partner: { Args: { check_user_id: string }; Returns: boolean }
      // Added by supabase/migrations/20260731_partner_area.sql (partner schema).
      // Hand-written: regenerating types will pick these up automatically.
      get_partner_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          earned_total: number
          earned_today: number
          earned_week: number
          trips_total: number
          trips_today: number
          avg_rating: number | null
          rating_count: number
        }[]
      }
      get_partner_payouts: {
        Args: { _limit?: number }
        Returns: {
          order_id: string
          order_number: string
          amount: number
          distance_km: number | null
          status: string
          created_at: string
          paid_at: string | null
        }[]
      }
      rate_delivery: {
        Args: { _order_id: string; _rating: number; _comment?: string }
        Returns: undefined
      }
      // Added by supabase/migrations/20260802_order_sla.sql
      get_sla_config: {
        Args: Record<PropertyKey, never>
        Returns: {
          sla_minutes: number
          at_risk_minutes: number
          accept_headroom_min: number
        }[]
      }
      expire_stale_orders: { Args: Record<PropertyKey, never>; Returns: number }
      // Added by supabase/migrations/20260803_admin_console.sql
      is_admin: { Args: Record<PropertyKey, never>; Returns: boolean }
      // Added by supabase/migrations/20260804_closed_access_control.sql
      is_manager: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_distributor: { Args: Record<PropertyKey, never>; Returns: boolean }
      is_staff: { Args: Record<PropertyKey, never>; Returns: boolean }
      my_role: { Args: Record<PropertyKey, never>; Returns: string }
      my_staff_profile: {
        Args: Record<PropertyKey, never>
        Returns: {
          id: string
          email: string | null
          role: string
          full_name: string
          phone: string | null
          manager_id: string | null
          is_active: boolean
          must_change_password: boolean
        }[]
      }
      admin_create_staff: {
        Args: {
          _email: string
          _password: string
          _role: string
          _full_name: string
          _phone?: string | null
          _manager_id?: string | null
        }
        Returns: string
      }
      admin_set_password: { Args: { _user_id: string; _password: string }; Returns: undefined }
      admin_set_active: { Args: { _user_id: string; _active: boolean }; Returns: undefined }
      // Added by supabase/migrations/20260805_self_service_password.sql
      resolve_login_email: { Args: { _username: string }; Returns: string | null }
      staff_email_exists: { Args: { _email: string }; Returns: boolean }
      clear_must_change_password: { Args: Record<PropertyKey, never>; Returns: undefined }
      admin_stats: {
        Args: Record<PropertyKey, never>
        Returns: {
          total_users: number
          total_partners: number
          active_partners: number
          total_orders: number
          pending_orders: number
          active_orders: number
          delivered_orders: number
          cancelled_orders: number
          orders_today: number
          revenue_total: number
          revenue_today: number
        }[]
      }
      admin_list_users: {
        Args: { _search?: string | null; _limit?: number }
        Returns: {
          id: string
          email: string | null
          display_name: string | null
          avatar_url: string | null
          roles: string[]
          is_partner: boolean
          order_count: number
          created_at: string
          last_sign_in: string | null
        }[]
      }
      admin_list_partners: {
        Args: { _search?: string | null; _limit?: number }
        Returns: {
          id: string
          full_name: string | null
          phone_number: string | null
          vehicle_type: string | null
          is_active: boolean
          email: string | null
          delivered_count: number
          active_count: number
          created_at: string
        }[]
      }
      admin_list_orders: {
        Args: { _search?: string | null; _status?: string | null; _limit?: number }
        Returns: {
          id: string
          order_number: string
          status: string
          total_amount: number
          item_count: number
          customer_email: string | null
          partner_name: string | null
          delivery_address: string | null
          phone_number: string | null
          minutes_elapsed: number
          created_at: string
          updated_at: string | null
        }[]
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
