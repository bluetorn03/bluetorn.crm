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
    PostgrestVersion: "14.15"
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          actor_id: string | null
          actor_label: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json
          workspace_id: string | null
        }
        Insert: {
          action: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          workspace_id?: string | null
        }
        Update: {
          action?: string
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_logs_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      calendar_events: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          end_at: string | null
          id: string
          lead_id: string | null
          location: string | null
          notes: string | null
          property_id: string | null
          start_at: string
          status: string
          title: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_at?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          property_id?: string | null
          start_at: string
          status?: string
          title: string
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          end_at?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          notes?: string | null
          property_id?: string | null
          start_at?: string
          status?: string
          title?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "calendar_events_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "calendar_events_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          assigned_to: string | null
          city: string | null
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          name: string
          notes: string | null
          phone: string | null
          status: string
          tags: string[]
          type: string
          updated_at: string
          value: number
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          name: string
          notes?: string | null
          phone?: string | null
          status?: string
          tags?: string[]
          type?: string
          updated_at?: string
          value?: number
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          name?: string
          notes?: string | null
          phone?: string | null
          status?: string
          tags?: string[]
          type?: string
          updated_at?: string
          value?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          amount: number
          description: string
          id: string
          invoice_id: string
          position: number
          quantity: number
          unit_amount: number
          workspace_id: string
        }
        Insert: {
          amount?: number
          description: string
          id?: string
          invoice_id: string
          position?: number
          quantity?: number
          unit_amount?: number
          workspace_id: string
        }
        Update: {
          amount?: number
          description?: string
          id?: string
          invoice_id?: string
          position?: number
          quantity?: number
          unit_amount?: number
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          due_date: string | null
          id: string
          invoice_number: string
          issue_date: string
          notes: string | null
          property_id: string | null
          status: string
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
          workspace_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number: string
          issue_date?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          workspace_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          due_date?: string | null
          id?: string
          invoice_number?: string
          issue_date?: string
          notes?: string | null
          property_id?: string | null
          status?: string
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      lead_activities: {
        Row: {
          actor_id: string | null
          actor_label: string | null
          created_at: string
          id: string
          lead_id: string
          note: string | null
          type: string
          workspace_id: string
        }
        Insert: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          lead_id: string
          note?: string | null
          type: string
          workspace_id: string
        }
        Update: {
          actor_id?: string | null
          actor_label?: string | null
          created_at?: string
          id?: string
          lead_id?: string
          note?: string | null
          type?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lead_activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "lead_activities_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          assigned_to: string | null
          budget: number
          campaign: string | null
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          email: string | null
          external_id: string | null
          id: string
          name: string
          next_follow_up: string | null
          notes: string | null
          phone: string | null
          property_id: string | null
          received_at: string
          requirement: string | null
          score: number
          source: string
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          budget?: number
          campaign?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          name: string
          next_follow_up?: string | null
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          received_at?: string
          requirement?: string | null
          score?: number
          source?: string
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          budget?: number
          campaign?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          email?: string | null
          external_id?: string | null
          id?: string
          name?: string
          next_follow_up?: string | null
          notes?: string | null
          phone?: string | null
          property_id?: string | null
          received_at?: string
          requirement?: string | null
          score?: number
          source?: string
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "leads_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          created_at: string
          created_by: string | null
          currency: string
          customer_id: string | null
          id: string
          invoice_id: string | null
          method: string
          notes: string | null
          paid_at: string
          reference: string | null
          status: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          customer_id?: string | null
          id?: string
          invoice_id?: string | null
          method?: string
          notes?: string | null
          paid_at?: string
          reference?: string | null
          status?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_invoice_id_fkey"
            columns: ["invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          code: string
          created_at: string
          currency: string
          description: string | null
          features: string[]
          id: string
          is_active: boolean
          name: string
          price_monthly: number
          seat_limit: number
          sort_order: number
          updated_at: string
        }
        Insert: {
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          name: string
          price_monthly?: number
          seat_limit?: number
          sort_order?: number
          updated_at?: string
        }
        Update: {
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          features?: string[]
          id?: string
          is_active?: boolean
          name?: string
          price_monthly?: number
          seat_limit?: number
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      platform_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string
          id: string
          is_active: boolean
          job_title: string | null
          last_login_at: string | null
          phone: string | null
          updated_at: string
          user_code: string
          workspace_id: string | null
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name: string
          id: string
          is_active?: boolean
          job_title?: string | null
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_code: string
          workspace_id?: string | null
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string
          id?: string
          is_active?: boolean
          job_title?: string | null
          last_login_at?: string | null
          phone?: string | null
          updated_at?: string
          user_code?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "profiles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      promo_media: {
        Row: {
          body: string | null
          created_at: string
          end_at: string | null
          id: string
          image_url: string | null
          is_active: boolean
          priority: number
          start_at: string
          target: string
          title: string
          updated_at: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          priority?: number
          start_at?: string
          target?: string
          title: string
          updated_at?: string
        }
        Update: {
          body?: string | null
          created_at?: string
          end_at?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          priority?: number
          start_at?: string
          target?: string
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      properties: {
        Row: {
          area_sqft: number | null
          assigned_to: string | null
          bedrooms: number | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          image_url: string | null
          location: string | null
          name: string
          price: number
          status: string
          type: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          area_sqft?: number | null
          assigned_to?: string | null
          bedrooms?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name: string
          price?: number
          status?: string
          type?: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          area_sqft?: number | null
          assigned_to?: string | null
          bedrooms?: number | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          image_url?: string | null
          location?: string | null
          name?: string
          price?: number
          status?: string
          type?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "properties_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      tasks: {
        Row: {
          assigned_to: string | null
          created_at: string
          created_by: string | null
          customer_id: string | null
          description: string | null
          due_at: string | null
          id: string
          lead_id: string | null
          priority: string
          property_id: string | null
          status: string
          title: string
          updated_at: string
          workspace_id: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title: string
          updated_at?: string
          workspace_id: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          customer_id?: string | null
          description?: string | null
          due_at?: string | null
          id?: string
          lead_id?: string | null
          priority?: string
          property_id?: string | null
          status?: string
          title?: string
          updated_at?: string
          workspace_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tasks_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_property_id_fkey"
            columns: ["property_id"]
            isOneToOne: false
            referencedRelation: "properties"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tasks_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
          workspace_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
          workspace_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "user_roles_workspace_id_fkey"
            columns: ["workspace_id"]
            isOneToOne: false
            referencedRelation: "workspaces"
            referencedColumns: ["id"]
          },
        ]
      }
      workspaces: {
        Row: {
          address: string | null
          code: string
          contact_email: string | null
          contact_phone: string | null
          created_at: string
          currency: string
          date_format: string
          id: string
          industry: string
          legal_name: string | null
          logo_url: string | null
          name: string
          plan: string
          primary_color: string | null
          seat_limit: number
          status: Database["public"]["Enums"]["workspace_status"]
          time_format: string
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          code: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          industry?: string
          legal_name?: string | null
          logo_url?: string | null
          name: string
          plan?: string
          primary_color?: string | null
          seat_limit?: number
          status?: Database["public"]["Enums"]["workspace_status"]
          time_format?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          code?: string
          contact_email?: string | null
          contact_phone?: string | null
          created_at?: string
          currency?: string
          date_format?: string
          id?: string
          industry?: string
          legal_name?: string | null
          logo_url?: string | null
          name?: string
          plan?: string
          primary_color?: string | null
          seat_limit?: number
          status?: Database["public"]["Enums"]["workspace_status"]
          time_format?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      can_manage_workspace_users: {
        Args: { _user_id: string }
        Returns: boolean
      }
      can_view_finance: { Args: { _user_id: string }; Returns: boolean }
      current_workspace_id: { Args: never; Returns: string }
      has_workspace_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      is_super_admin: { Args: { _user_id: string }; Returns: boolean }
    }
    Enums: {
      app_role: "super_admin" | "owner" | "manager" | "employee"
      workspace_status: "active" | "trial" | "suspended" | "inactive"
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
    Enums: {
      app_role: ["super_admin", "owner", "manager", "employee"],
      workspace_status: ["active", "trial", "suspended", "inactive"],
    },
  },
} as const
