export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  graphql_public: {
    Tables: {
      [_ in never]: never;
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      graphql: {
        Args: {
          extensions?: Json;
          operationName?: string;
          query?: string;
          variables?: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
  public: {
    Tables: {
      audit_log: {
        Row: {
          action: string;
          actor_id: string | null;
          created_at: string;
          id: string;
          ip: unknown;
          target_id: string | null;
          target_type: string;
          updated_at: string;
        };
        Insert: {
          action: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: unknown;
          target_id?: string | null;
          target_type: string;
          updated_at?: string;
        };
        Update: {
          action?: string;
          actor_id?: string | null;
          created_at?: string;
          id?: string;
          ip?: unknown;
          target_id?: string | null;
          target_type?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      checklists: {
        Row: {
          answers: Json;
          completed_step: number;
          created_at: string;
          id: string;
          order_id: string;
          revision: number;
          schema_version: number;
          updated_at: string;
        };
        Insert: {
          answers: Json;
          completed_step?: number;
          created_at?: string;
          id?: string;
          order_id: string;
          revision?: number;
          schema_version: number;
          updated_at?: string;
        };
        Update: {
          answers?: Json;
          completed_step?: number;
          created_at?: string;
          id?: string;
          order_id?: string;
          revision?: number;
          schema_version?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "checklists_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      clients: {
        Row: {
          contract_revision: number;
          created_at: string;
          deletion_requested_at: string | null;
          document: string | null;
          has_contract: boolean;
          id: string;
          kind: string;
          legal_name: string;
          owner_id: string;
          updated_at: string;
        };
        Insert: {
          contract_revision?: number;
          created_at?: string;
          deletion_requested_at?: string | null;
          document?: string | null;
          has_contract?: boolean;
          id?: string;
          kind?: string;
          legal_name?: string;
          owner_id: string;
          updated_at?: string;
        };
        Update: {
          contract_revision?: number;
          created_at?: string;
          deletion_requested_at?: string | null;
          document?: string | null;
          has_contract?: boolean;
          id?: string;
          kind?: string;
          legal_name?: string;
          owner_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "clients_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      consents: {
        Row: {
          accepted_at: string;
          created_at: string;
          document: string;
          id: string;
          ip: unknown;
          profile_id: string;
          updated_at: string;
          version: string;
        };
        Insert: {
          accepted_at?: string;
          created_at?: string;
          document: string;
          id?: string;
          ip?: unknown;
          profile_id: string;
          updated_at?: string;
          version: string;
        };
        Update: {
          accepted_at?: string;
          created_at?: string;
          document?: string;
          id?: string;
          ip?: unknown;
          profile_id?: string;
          updated_at?: string;
          version?: string;
        };
        Relationships: [
          {
            foreignKeyName: "consents_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deadlines: {
        Row: {
          act_type: string;
          adjustments: Json;
          created_at: string;
          days: number;
          due_date: string;
          id: string;
          internal_due_date: string;
          notice_date: string;
          order_id: string;
          slack_days: number;
          updated_at: string;
        };
        Insert: {
          act_type: string;
          adjustments?: Json;
          created_at?: string;
          days: number;
          due_date: string;
          id?: string;
          internal_due_date: string;
          notice_date: string;
          order_id: string;
          slack_days: number;
          updated_at?: string;
        };
        Update: {
          act_type?: string;
          adjustments?: Json;
          created_at?: string;
          days?: number;
          due_date?: string;
          id?: string;
          internal_due_date?: string;
          notice_date?: string;
          order_id?: string;
          slack_days?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "deadlines_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      decisions: {
        Row: {
          client_confirmed_at: string | null;
          client_confirmed_by: string | null;
          created_at: string;
          id: string;
          order_id: string | null;
          page: number | null;
          parameter: string;
          process_id: string;
          rationale: string;
          recorded_by: string;
          source: string;
          updated_at: string;
          value: string;
        };
        Insert: {
          client_confirmed_at?: string | null;
          client_confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          page?: number | null;
          parameter: string;
          process_id: string;
          rationale: string;
          recorded_by: string;
          source: string;
          updated_at?: string;
          value: string;
        };
        Update: {
          client_confirmed_at?: string | null;
          client_confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          order_id?: string | null;
          page?: number | null;
          parameter?: string;
          process_id?: string;
          rationale?: string;
          recorded_by?: string;
          source?: string;
          updated_at?: string;
          value?: string;
        };
        Relationships: [
          {
            foreignKeyName: "decisions_client_confirmed_by_fkey";
            columns: ["client_confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_order_id_process_id_fkey";
            columns: ["order_id", "process_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "process_id"];
          },
          {
            foreignKeyName: "decisions_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "decisions_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      deliveries: {
        Row: {
          checklist: Json;
          confirmed_by: string;
          created_at: string;
          id: string;
          index_month: string;
          order_id: string;
          payload: Json;
          pje_version: string;
          process_id: string;
          professional: Json;
        };
        Insert: {
          checklist: Json;
          confirmed_by: string;
          created_at?: string;
          id: string;
          index_month: string;
          order_id: string;
          payload: Json;
          pje_version: string;
          process_id: string;
          professional: Json;
        };
        Update: {
          checklist?: Json;
          confirmed_by?: string;
          created_at?: string;
          id?: string;
          index_month?: string;
          order_id?: string;
          payload?: Json;
          pje_version?: string;
          process_id?: string;
          professional?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "deliveries_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "deliveries_order_id_process_id_fkey";
            columns: ["order_id", "process_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "process_id"];
          },
          {
            foreignKeyName: "deliveries_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_files: {
        Row: {
          delivery_id: string;
          file_id: string;
          kind: string;
          snapshot: Json;
        };
        Insert: {
          delivery_id: string;
          file_id: string;
          kind: string;
          snapshot: Json;
        };
        Update: {
          delivery_id?: string;
          file_id?: string;
          kind?: string;
          snapshot?: Json;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_files_delivery_id_fkey";
            columns: ["delivery_id"];
            isOneToOne: false;
            referencedRelation: "deliveries";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_files_file_id_fkey";
            columns: ["file_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_policy_approvals: {
        Row: {
          approved_by: string;
          created_at: string;
          id: string;
          policy: string;
          prior_policy: string | null;
          settings_revision: number;
        };
        Insert: {
          approved_by: string;
          created_at?: string;
          id: string;
          policy: string;
          prior_policy?: string | null;
          settings_revision: number;
        };
        Update: {
          approved_by?: string;
          created_at?: string;
          id?: string;
          policy?: string;
          prior_policy?: string | null;
          settings_revision?: number;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_policy_approvals_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      delivery_releases: {
        Row: {
          approved_by: string;
          created_at: string;
          delivery_id: string;
          policy: string;
          request_id: string;
        };
        Insert: {
          approved_by: string;
          created_at?: string;
          delivery_id: string;
          policy: string;
          request_id?: string;
        };
        Update: {
          approved_by?: string;
          created_at?: string;
          delivery_id?: string;
          policy?: string;
          request_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "delivery_releases_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "delivery_releases_delivery_id_fkey";
            columns: ["delivery_id"];
            isOneToOne: true;
            referencedRelation: "deliveries";
            referencedColumns: ["id"];
          },
        ];
      };
      files: {
        Row: {
          bucket: string;
          created_at: string;
          expected_sha256: string | null;
          folder: string;
          id: string;
          mime: string;
          name: string;
          order_id: string | null;
          pages: number | null;
          path: string;
          process_id: string;
          sha256: string | null;
          size_bytes: number;
          updated_at: string;
          upload_status: string;
          uploaded_by: string;
          version: number;
        };
        Insert: {
          bucket?: string;
          created_at?: string;
          expected_sha256?: string | null;
          folder: string;
          id?: string;
          mime: string;
          name: string;
          order_id?: string | null;
          pages?: number | null;
          path: string;
          process_id: string;
          sha256?: string | null;
          size_bytes: number;
          updated_at?: string;
          upload_status?: string;
          uploaded_by: string;
          version?: number;
        };
        Update: {
          bucket?: string;
          created_at?: string;
          expected_sha256?: string | null;
          folder?: string;
          id?: string;
          mime?: string;
          name?: string;
          order_id?: string | null;
          pages?: number | null;
          path?: string;
          process_id?: string;
          sha256?: string | null;
          size_bytes?: number;
          updated_at?: string;
          upload_status?: string;
          uploaded_by?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "files_order_id_process_id_fkey";
            columns: ["order_id", "process_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "process_id"];
          },
          {
            foreignKeyName: "files_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "files_uploaded_by_fkey";
            columns: ["uploaded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          attachment_ids: string[];
          author_id: string;
          body: string;
          created_at: string;
          id: string;
          process_id: string;
          updated_at: string;
        };
        Insert: {
          attachment_ids?: string[];
          author_id: string;
          body: string;
          created_at?: string;
          id?: string;
          process_id: string;
          updated_at?: string;
        };
        Update: {
          attachment_ids?: string[];
          author_id?: string;
          body?: string;
          created_at?: string;
          id?: string;
          process_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "messages_author_id_fkey";
            columns: ["author_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
        ];
      };
      notification_preferences: {
        Row: {
          channel: string;
          created_at: string;
          enabled: boolean;
          event: string;
          id: string;
          profile_id: string;
          revision: number;
          updated_at: string;
        };
        Insert: {
          channel: string;
          created_at?: string;
          enabled?: boolean;
          event: string;
          id?: string;
          profile_id: string;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          channel?: string;
          created_at?: string;
          enabled?: boolean;
          event?: string;
          id?: string;
          profile_id?: string;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notification_preferences_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      notifications: {
        Row: {
          attempts: number;
          cancellation_reason: string | null;
          cancelled_at: string | null;
          channel: string;
          created_at: string;
          data: Json;
          dedup_key: string;
          id: string;
          last_error: string | null;
          recipient: string;
          send_after: string;
          sent_at: string | null;
          status: string;
          template: string;
          updated_at: string;
        };
        Insert: {
          attempts?: number;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          channel: string;
          created_at?: string;
          data?: Json;
          dedup_key: string;
          id?: string;
          last_error?: string | null;
          recipient: string;
          send_after?: string;
          sent_at?: string | null;
          status?: string;
          template: string;
          updated_at?: string;
        };
        Update: {
          attempts?: number;
          cancellation_reason?: string | null;
          cancelled_at?: string | null;
          channel?: string;
          created_at?: string;
          data?: Json;
          dedup_key?: string;
          id?: string;
          last_error?: string | null;
          recipient?: string;
          send_after?: string;
          sent_at?: string | null;
          status?: string;
          template?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          area: string;
          calc_type: string;
          client_id: string;
          code: string;
          complexity: string | null;
          created_at: string;
          delivery_date: string | null;
          deposit_cents: number;
          id: string;
          internal_due_date: string | null;
          price_table_id: string | null;
          process_id: string;
          resume_status: string | null;
          status: string;
          status_revision: number;
          total_cents: number;
          updated_at: string;
          urgent: boolean;
        };
        Insert: {
          area?: string;
          calc_type: string;
          client_id: string;
          code?: string;
          complexity?: string | null;
          created_at?: string;
          delivery_date?: string | null;
          deposit_cents?: number;
          id?: string;
          internal_due_date?: string | null;
          price_table_id?: string | null;
          process_id: string;
          resume_status?: string | null;
          status?: string;
          status_revision?: number;
          total_cents?: number;
          updated_at?: string;
          urgent?: boolean;
        };
        Update: {
          area?: string;
          calc_type?: string;
          client_id?: string;
          code?: string;
          complexity?: string | null;
          created_at?: string;
          delivery_date?: string | null;
          deposit_cents?: number;
          id?: string;
          internal_due_date?: string | null;
          price_table_id?: string | null;
          process_id?: string;
          resume_status?: string | null;
          status?: string;
          status_revision?: number;
          total_cents?: number;
          updated_at?: string;
          urgent?: boolean;
        };
        Relationships: [
          {
            foreignKeyName: "orders_price_table_id_fkey";
            columns: ["price_table_id"];
            isOneToOne: false;
            referencedRelation: "price_tables";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_process_id_client_id_fkey";
            columns: ["process_id", "client_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id", "client_id"];
          },
        ];
      };
      page_index: {
        Row: {
          created_at: string;
          file_id: string;
          id: string;
          note: string | null;
          pages: string;
          piece: string;
          process_id: string;
          recorded_by: string | null;
          revision: number;
          updated_at: string;
        };
        Insert: {
          created_at?: string;
          file_id: string;
          id?: string;
          note?: string | null;
          pages: string;
          piece: string;
          process_id: string;
          recorded_by?: string | null;
          revision?: number;
          updated_at?: string;
        };
        Update: {
          created_at?: string;
          file_id?: string;
          id?: string;
          note?: string | null;
          pages?: string;
          piece?: string;
          process_id?: string;
          recorded_by?: string | null;
          revision?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "page_index_file_id_process_id_fkey";
            columns: ["file_id", "process_id"];
            isOneToOne: false;
            referencedRelation: "files";
            referencedColumns: ["id", "process_id"];
          },
          {
            foreignKeyName: "page_index_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "page_index_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      payments: {
        Row: {
          amount_cents: number;
          confirmed_at: string | null;
          confirmed_by: string | null;
          created_at: string;
          id: string;
          kind: string;
          method: string;
          order_id: string;
          provider_ref: string | null;
          status: string;
          updated_at: string;
        };
        Insert: {
          amount_cents: number;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          kind: string;
          method: string;
          order_id: string;
          provider_ref?: string | null;
          status?: string;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number;
          confirmed_at?: string | null;
          confirmed_by?: string | null;
          created_at?: string;
          id?: string;
          kind?: string;
          method?: string;
          order_id?: string;
          provider_ref?: string | null;
          status?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "payments_confirmed_by_fkey";
            columns: ["confirmed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "payments_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
        ];
      };
      price_items: {
        Row: {
          amount_cents: number | null;
          code: string;
          created_at: string;
          id: string;
          kind: string;
          label: string;
          percent_bp: number | null;
          price_table_id: string;
          rule: Json;
          updated_at: string;
        };
        Insert: {
          amount_cents?: number | null;
          code: string;
          created_at?: string;
          id?: string;
          kind: string;
          label: string;
          percent_bp?: number | null;
          price_table_id: string;
          rule?: Json;
          updated_at?: string;
        };
        Update: {
          amount_cents?: number | null;
          code?: string;
          created_at?: string;
          id?: string;
          kind?: string;
          label?: string;
          percent_bp?: number | null;
          price_table_id?: string;
          rule?: Json;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "price_items_price_table_id_fkey";
            columns: ["price_table_id"];
            isOneToOne: false;
            referencedRelation: "price_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      price_tables: {
        Row: {
          activated_at: string | null;
          active: boolean;
          created_at: string;
          created_by: string | null;
          id: string;
          is_example: boolean;
          parameters: Json;
          updated_at: string;
          version: number;
        };
        Insert: {
          activated_at?: string | null;
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_example?: boolean;
          parameters?: Json;
          updated_at?: string;
          version: number;
        };
        Update: {
          activated_at?: string | null;
          active?: boolean;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          is_example?: boolean;
          parameters?: Json;
          updated_at?: string;
          version?: number;
        };
        Relationships: [
          {
            foreignKeyName: "price_tables_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      processes: {
        Row: {
          chamber: string;
          claimants_count: number;
          client_id: string;
          cnj_number: string;
          court: string;
          created_at: string;
          id: string;
          side: string;
          updated_at: string;
        };
        Insert: {
          chamber?: string;
          claimants_count?: number;
          client_id: string;
          cnj_number: string;
          court: string;
          created_at?: string;
          id?: string;
          side: string;
          updated_at?: string;
        };
        Update: {
          chamber?: string;
          claimants_count?: number;
          client_id?: string;
          cnj_number?: string;
          court?: string;
          created_at?: string;
          id?: string;
          side?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "processes_client_id_fkey";
            columns: ["client_id"];
            isOneToOne: false;
            referencedRelation: "clients";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          city: string | null;
          created_at: string;
          full_name: string;
          id: string;
          oab_number: string | null;
          oab_state: string | null;
          phone: string | null;
          role: string;
          updated_at: string;
        };
        Insert: {
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id: string;
          oab_number?: string | null;
          oab_state?: string | null;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Update: {
          city?: string | null;
          created_at?: string;
          full_name?: string;
          id?: string;
          oab_number?: string | null;
          oab_state?: string | null;
          phone?: string | null;
          role?: string;
          updated_at?: string;
        };
        Relationships: [];
      };
      quotes: {
        Row: {
          accepted_at: string | null;
          accepted_by: string | null;
          accepted_ip: unknown;
          accepted_user_agent: string | null;
          checklist_revision: number | null;
          created_at: string;
          id: string;
          is_simulation: boolean;
          items: Json;
          number: string;
          order_id: string;
          price_table_id: string | null;
          proposal_snapshot: Json | null;
          total_cents: number;
          updated_at: string;
          valid_until: string;
        };
        Insert: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          accepted_ip?: unknown;
          accepted_user_agent?: string | null;
          checklist_revision?: number | null;
          created_at?: string;
          id?: string;
          is_simulation?: boolean;
          items: Json;
          number: string;
          order_id: string;
          price_table_id?: string | null;
          proposal_snapshot?: Json | null;
          total_cents: number;
          updated_at?: string;
          valid_until: string;
        };
        Update: {
          accepted_at?: string | null;
          accepted_by?: string | null;
          accepted_ip?: unknown;
          accepted_user_agent?: string | null;
          checklist_revision?: number | null;
          created_at?: string;
          id?: string;
          is_simulation?: boolean;
          items?: Json;
          number?: string;
          order_id?: string;
          price_table_id?: string | null;
          proposal_snapshot?: Json | null;
          total_cents?: number;
          updated_at?: string;
          valid_until?: string;
        };
        Relationships: [
          {
            foreignKeyName: "quotes_accepted_by_fkey";
            columns: ["accepted_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "quotes_price_table_id_fkey";
            columns: ["price_table_id"];
            isOneToOne: false;
            referencedRelation: "price_tables";
            referencedColumns: ["id"];
          },
        ];
      };
      reviews: {
        Row: {
          body: string;
          created_at: string;
          id: string;
          order_id: string;
          profile_id: string;
          published: boolean;
          rating: number;
          updated_at: string;
        };
        Insert: {
          body?: string;
          created_at?: string;
          id?: string;
          order_id: string;
          profile_id: string;
          published?: boolean;
          rating: number;
          updated_at?: string;
        };
        Update: {
          body?: string;
          created_at?: string;
          id?: string;
          order_id?: string;
          profile_id?: string;
          published?: boolean;
          rating?: number;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "reviews_order_id_fkey";
            columns: ["order_id"];
            isOneToOne: true;
            referencedRelation: "orders";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reviews_profile_id_fkey";
            columns: ["profile_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      settings: {
        Row: {
          approved_privacy_version: string | null;
          approved_terms_version: string | null;
          complexity_limits: Json;
          contact_email: string | null;
          contact_phone: string | null;
          crc_category: string | null;
          crc_number: string | null;
          crc_state: string | null;
          created_at: string;
          deadline_window_end: string;
          deadline_window_start: string;
          default_texts: Json;
          delivery_release_policy: string | null;
          id: string;
          notification_times: Json;
          pix_key: string | null;
          quote_valid_days: number;
          revision: number;
          singleton: boolean;
          slack_days: number;
          technical_name: string | null;
          updated_at: string;
          urgency_bp: number;
        };
        Insert: {
          approved_privacy_version?: string | null;
          approved_terms_version?: string | null;
          complexity_limits?: Json;
          contact_email?: string | null;
          contact_phone?: string | null;
          crc_category?: string | null;
          crc_number?: string | null;
          crc_state?: string | null;
          created_at?: string;
          deadline_window_end?: string;
          deadline_window_start?: string;
          default_texts?: Json;
          delivery_release_policy?: string | null;
          id?: string;
          notification_times?: Json;
          pix_key?: string | null;
          quote_valid_days?: number;
          revision?: number;
          singleton?: boolean;
          slack_days?: number;
          technical_name?: string | null;
          updated_at?: string;
          urgency_bp?: number;
        };
        Update: {
          approved_privacy_version?: string | null;
          approved_terms_version?: string | null;
          complexity_limits?: Json;
          contact_email?: string | null;
          contact_phone?: string | null;
          crc_category?: string | null;
          crc_number?: string | null;
          crc_state?: string | null;
          created_at?: string;
          deadline_window_end?: string;
          deadline_window_start?: string;
          default_texts?: Json;
          delivery_release_policy?: string | null;
          id?: string;
          notification_times?: Json;
          pix_key?: string | null;
          quote_valid_days?: number;
          revision?: number;
          singleton?: boolean;
          slack_days?: number;
          technical_name?: string | null;
          updated_at?: string;
          urgency_bp?: number;
        };
        Relationships: [];
      };
      timeline_events: {
        Row: {
          actor_id: string | null;
          created_at: string;
          data: Json;
          id: string;
          kind: string;
          order_id: string | null;
          process_id: string;
          updated_at: string;
        };
        Insert: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          kind: string;
          order_id?: string | null;
          process_id: string;
          updated_at?: string;
        };
        Update: {
          actor_id?: string | null;
          created_at?: string;
          data?: Json;
          id?: string;
          kind?: string;
          order_id?: string | null;
          process_id?: string;
          updated_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "timeline_events_actor_id_fkey";
            columns: ["actor_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "timeline_events_order_id_process_id_fkey";
            columns: ["order_id", "process_id"];
            isOneToOne: false;
            referencedRelation: "orders";
            referencedColumns: ["id", "process_id"];
          },
          {
            foreignKeyName: "timeline_events_process_id_fkey";
            columns: ["process_id"];
            isOneToOne: false;
            referencedRelation: "processes";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      finalize_fixture_payment_webhook: {
        Args: {
          decision_action: string;
          expected_charge_revision: number;
          expected_epoch: number;
          expected_journal_fingerprint: string;
          expected_position_revision: number;
          expected_source_fingerprint: string;
          position_value: Json;
          target_run: string;
          worker_id: string;
        };
        Returns: Json;
      };
      get_fixture_webhook_finalization_receipt: {
        Args: { expected_epoch: number; target_run: string; worker_id: string };
        Returns: Json;
      };
      get_fixture_webhook_context: {
        Args: { expected_epoch: number; target_run: string; worker_id: string };
        Returns: Json;
      };
      record_fixture_webhook_query: {
        Args: {
          expected_epoch: number;
          target_observation: string;
          target_run: string;
          worker_id: string;
        };
        Returns: Json;
      };
      claim_fixture_payment_webhook: {
        Args: { request_id: string; target_event: string };
        Returns: Json;
      };
      receive_fixture_payment_webhook: {
        Args: { body_text: string; source_hash: string; target_scope: string };
        Returns: Json;
      };
      begin_notification_local_run: {
        Args: {
          run_id: string;
          channel: string;
          batch_limit: number;
          target_notifications?: string[];
        };
        Returns: Json;
      };
      get_notification_local_receipt: {
        Args: { request_id: string };
        Returns: Json;
      };
      get_notification_local_transport_result: {
        Args: { request_id: string };
        Returns: Json;
      };
      simulate_notification_local_transport: {
        Args: { request_id: string };
        Returns: Json;
      };
      claim_notification_local_system: {
        Args: {
          request_id: string;
          channel: string;
          target_notification?: string;
        };
        Returns: Json;
      };
      validate_notification_local_claim: {
        Args: { request_id: string };
        Returns: boolean;
      };
      complete_notification_local_system: {
        Args: { request_id: string; outcome: string };
        Returns: Json;
      };
      reject_quote_system: {
        Args: {
          actor: string;
          target_quote: string;
          expected_context: string;
          expected_revision: number;
          request_id: string;
          confirmed: boolean;
          reason: string;
          ip_address: string;
          user_agent: string;
        };
        Returns: Json;
      };
      accept_quote_system: {
        Args: {
          actor: string;
          confirmed: boolean;
          expected_context: string;
          ip_address: string;
          request_id: string;
          target_quote: string;
          user_agent: string;
        };
        Returns: Json;
      };
      add_process_note: {
        Args: { note_body: string; request_id: string; target_process: string };
        Returns: string;
      };
      approve_existing_delivery_release: {
        Args: {
          approved: boolean;
          policy: string;
          request_id: string;
          target_delivery: string;
        };
        Returns: Json;
      };
      approve_future_delivery_policy: {
        Args: {
          approved: boolean;
          expected_revision: number;
          policy: string;
          request_id: string;
        };
        Returns: Json;
      };
      complete_file_system: {
        Args: {
          actor: string;
          observed_hash: string;
          observed_size: number;
          target_file: string;
        };
        Returns: undefined;
      };
      confirm_manual_deposit: {
        Args: {
          confirmed: boolean;
          expected_context: string;
          expected_remaining_cents: number;
          request_id: string;
          target_quote: string;
        };
        Returns: Json;
      };
      confirm_order_delivery: {
        Args: {
          payload: Json;
          request_id: string;
          target_order: string;
          target_process: string;
        };
        Returns: string;
      };
      confirm_process_decision: {
        Args: { target_decision: string };
        Returns: string;
      };
      create_checklist_quote_system: {
        Args: {
          actor: string;
          expected_checklist_revision: number;
          expected_price_table?: string;
          expected_settings_revision?: number;
          proposal?: Json;
          request_id: string;
          target_order: string;
        };
        Returns: string;
      };
      enqueue_deadline_reminder: {
        Args: {
          expected_due: string;
          one_day?: string;
          reference_date: string;
          reminder_event: string;
          target_order: string;
          two_days?: string;
        };
        Returns: string;
      };
      get_calculator_notification_context: { Args: never; Returns: Json };
      get_client_contract_context: {
        Args: { target_clients: string[] };
        Returns: Json;
      };
      get_complexity_limits: { Args: never; Returns: Json };
      get_current_delivery_access_contexts: {
        Args: { target_deliveries: string[]; target_process: string };
        Returns: Json;
      };
      get_current_order_credits: {
        Args: { target_orders: string[] };
        Returns: Json;
      };
      get_delivery_credit_instructions: {
        Args: { target_deliveries: string[]; target_process: string };
        Returns: Json;
      };
      get_delivery_display_context: {
        Args: { target_deliveries: string[]; target_process: string };
        Returns: Json;
      };
      get_delivery_payment_instructions: {
        Args: { target_deliveries: string[]; target_process: string };
        Returns: {
          delivery_id: string;
          order_code: string;
          pix_key: string | null;
          remaining_cents: number | null;
        }[];
      };
      get_legal_versions: {
        Args: never;
        Returns: {
          privacy_version: string;
          terms_version: string;
        }[];
      };
      get_process_contract_quote_ids: {
        Args: { target_process: string };
        Returns: {
          quote_id: string;
        }[];
      };
      get_process_decision_export: {
        Args: { target_process: string };
        Returns: Json;
      };
      get_process_deposit_instructions: {
        Args: { target_process: string };
        Returns: Json;
      };
      get_payment_obligation: {
        Args: { target_order: string; target_phase: string };
        Returns: Json;
      };
      prepare_payment_invoice: {
        Args: { target_order: string };
        Returns: Json;
      };
      prepare_payment_balance_invoice: {
        Args: { target_order: string };
        Returns: Json;
      };
      read_payment_invoice_fixture: {
        Args: { target_query: string };
        Returns: Json;
      };
      record_payment_invoice_result: {
        Args: { target_query: string; available: boolean };
        Returns: undefined;
      };
      finish_payment_invoice: {
        Args: { target_query: string };
        Returns: Json;
      };
      prepare_payment_obligation: {
        Args: {
          target_order: string;
          target_phase: string;
          expected_context: string;
          expected_remaining_cents: number;
          billing_type: string;
          due_date: string;
          request_id: string;
        };
        Returns: Json;
      };
      reserve_payment_intent: {
        Args: { target_context: string; request_id: string };
        Returns: Json;
      };
      withdraw_payment_intent: {
        Args: {
          target_intent: string;
          expected_revision: number;
          request_id: string;
        };
        Returns: Json;
      };
      get_payment_intent: {
        Args: { target_intent: string };
        Returns: Json;
      };
      get_order_payment_reservation: {
        Args: { target_order: string };
        Returns: Json;
      };
      get_order_financial_projection: {
        Args: { target_order: string };
        Returns: Json;
      };
      get_financial_projection_source: {
        Args: { target_observation: string };
        Returns: Json;
      };
      get_financial_application_receipt: {
        Args: { target_observation: string; request_id: string };
        Returns: Json;
      };
      get_financial_resolution_receipt: {
        Args: { target_application: string; request_id: string };
        Returns: Json;
      };
      get_financial_execution_resolution: {
        Args: { target_request: string };
        Returns: Json;
      };
      resolve_financial_execution: {
        Args: { target_application: string; request_id: string };
        Returns: Json;
      };
      get_fixture_legacy_origin_receipt: {
        Args: { target_observation: string; request_id: string };
        Returns: Json;
      };
      create_fixture_legacy_origin: {
        Args: { target_observation: string; request_id: string };
        Returns: Json;
      };
      get_fixture_legacy_binding_receipt: {
        Args: {
          target_origin: string;
          target_application: string;
          request_id: string;
        };
        Returns: Json;
      };
      bind_fixture_legacy_payment: {
        Args: {
          target_origin: string;
          target_application: string;
          request_id: string;
        };
        Returns: Json;
      };
      apply_financial_observation: {
        Args: {
          target_observation: string;
          request_id: string;
          expected_position_revision: number;
          expected_charge_revision: number;
          expected_journal_fingerprint: string;
          decision_action: string;
          position_value: Json;
        };
        Returns: Json;
      };
      get_financial_origin: {
        Args: { target_observation: string };
        Returns: Json;
      };
      capture_financial_origin: {
        Args: {
          target_observation: string;
          body_hash: string;
          facts: Json;
          proof: Json;
          source_order: number | null;
        };
        Returns: Json;
      };
      allocate_financial_query: {
        Args: { target_charge: string; request_id: string };
        Returns: Json;
      };
      start_financial_query: {
        Args: { target_query: string; worker_id: string; protocol: Json };
        Returns: boolean;
      };
      finish_financial_query: {
        Args: {
          target_query: string;
          worker_id: string;
          body_hash: string | null;
          facts: Json;
          proof: Json;
          source_order: number | null;
        };
        Returns: Json;
      };
      get_financial_query_observation: {
        Args: { target_query: string; worker_id: string };
        Returns: Json;
      };
      get_payment_execution_step: {
        Args: { target_step: string; worker_id: string };
        Returns: Json;
      };
      prepare_payment_execution_protocol: {
        Args: { target_step: string; worker_id: string; protocols: Json };
        Returns: boolean;
      };
      get_payment_execution_resolution: {
        Args: { target_request: string };
        Returns: Json;
      };
      resolve_payment_execution_no_dispatch: {
        Args: { target_request: string; request_id: string };
        Returns: Json;
      };
      finish_payment_execution_step: {
        Args: {
          target_step: string;
          worker_id: string;
          body_hash: string | null;
          normalizer_version: number;
          facts: Json;
        };
        Returns: Json;
      };
      claim_payment_execution_step: {
        Args: { target_request: string; worker_id: string };
        Returns: Json;
      };
      start_payment_execution_step: {
        Args: { target_step: string; worker_id: string };
        Returns: boolean;
      };
      get_payment_execution: {
        Args: { target_intent: string };
        Returns: Json;
      };
      request_payment_customer: {
        Args: { target_client: string; request_id: string };
        Returns: Json;
      };
      get_payment_customer_request: {
        Args: { target_request: string };
        Returns: Json;
      };
      claim_payment_customer_step: {
        Args: { target_request: string; worker_id: string };
        Returns: Json;
      };
      start_payment_customer_step: {
        Args: { target_step: string; worker_id: string };
        Returns: boolean;
      };
      finish_payment_customer_step: {
        Args: { target_step: string; worker_id: string };
        Returns: Json;
      };
      get_payment_fixture_scope: {
        Args: { target_scope: string; target_client: string };
        Returns: Json;
      };
      send_payment_fixture_request: {
        Args: {
          target_scope: string;
          target_client: string;
          slot_id: string;
          request_id: string;
          operation: string;
          fingerprint: string;
          payload: Json;
        };
        Returns: Json;
      };
      get_payment_fixture_receipt: {
        Args: {
          target_scope: string;
          target_client: string;
          slot_id: string;
          request_id: string;
        };
        Returns: Json;
      };
      get_process_participants: {
        Args: { target_process: string };
        Returns: {
          display_name: string;
          participant_role: string;
          profile_id: string;
        }[];
      };
      get_public_service_info: {
        Args: never;
        Returns: {
          contact_email: string;
          contact_phone: string;
          crc_category: string;
          crc_number: string;
          crc_state: string;
          guarantee: string;
          technical_name: string;
        }[];
      };
      get_public_price_table: { Args: never; Returns: Json };
      get_quote_contract_context: {
        Args: { target_quote: string };
        Returns: Json;
      };
      get_quote_pdf_export: { Args: { target_quote: string }; Returns: Json };
      is_admin: { Args: never; Returns: boolean };
      is_calculator: { Args: never; Returns: boolean };
      mutate_process_page_index: {
        Args: { payload: Json; request_id: string; target_process: string };
        Returns: string;
      };
      operate_order: {
        Args: {
          payload: Json;
          request_id: string;
          target_order: string;
          target_process: string;
        };
        Returns: Json;
      };
      prepare_file_upload: {
        Args: {
          expected_hash: string;
          file_mime: string;
          file_name: string;
          file_size: number;
          target_folder?: string;
          target_process: string;
        };
        Returns: {
          file_id: string;
          object_path: string;
        }[];
      };
      record_auth_audit: { Args: { event: string }; Returns: undefined };
      authorize_file_access: {
        Args: { access_kind?: string; target_file: string };
        Returns: Json;
      };
      record_file_access: {
        Args: { access_kind?: string; target_file: string };
        Returns: undefined;
      };
      record_process_decision: {
        Args: {
          decision_page?: number;
          decision_parameter: string;
          decision_rationale?: string;
          decision_source: string;
          decision_value: string;
          request_id?: string;
          target_process: string;
        };
        Returns: string;
      };
      request_account_deletion: { Args: never; Returns: string };
      save_checklist_draft: {
        Args: {
          completed_step: number;
          draft_id?: string;
          expected_revision?: number;
          payload: Json;
        };
        Returns: {
          order_code: string;
          order_id: string;
          process_id: string;
          revision: number;
          saved_step: number;
        }[];
      };
      save_price_version: {
        Args: {
          approved?: boolean;
          example: boolean;
          expected_version: number;
          payload: Json;
        };
        Returns: {
          is_active: boolean;
          table_id: string;
          table_version: number;
        }[];
      };
      save_service_settings: {
        Args: { expected_revision: number; payload: Json };
        Returns: number;
      };
      send_process_message: {
        Args: {
          attachments: string[];
          message_body: string;
          request_id: string;
          target_process: string;
        };
        Returns: string;
      };
      set_client_contract: {
        Args: {
          expected_revision: number;
          has_contract: boolean;
          reason: string;
          request_id: string;
          target_client: string;
        };
        Returns: Json;
      };
      set_my_notification_preference: {
        Args: {
          channel: string;
          enabled: boolean;
          event: string;
          expected_revision: number;
          request_id: string;
        };
        Returns: Json;
      };
      update_own_profile: {
        Args: {
          city: string;
          full_name: string;
          legal_name: string;
          oab_number: string;
          oab_state: string;
          phone: string;
        };
        Returns: undefined;
      };
    };
    Enums: {
      [_ in never]: never;
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<
  keyof Database,
  "public"
>];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const;
