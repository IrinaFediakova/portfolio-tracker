/**
 * PLACEHOLDER: hand-written to match supabase/migrations/0001_init.sql so the
 * typed Supabase clients compile out of the box.
 *
 * Replace it with the generated file once the migration has been applied:
 *
 *   npx supabase gen types typescript --project-id <ref> --schema public > src/types/database.ts
 */
export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  public: {
    Tables: {
      portfolios: {
        Row: {
          id: string;
          user_id: string;
          name: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string;
          name: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string;
          name?: string;
          created_at?: string;
        };
        Relationships: [];
      };
      assets: {
        Row: {
          id: string;
          symbol: string;
          name: string;
          type: Database["public"]["Enums"]["asset_type"];
        };
        Insert: {
          id?: string;
          symbol: string;
          name: string;
          type: Database["public"]["Enums"]["asset_type"];
        };
        Update: {
          id?: string;
          symbol?: string;
          name?: string;
          type?: Database["public"]["Enums"]["asset_type"];
        };
        Relationships: [];
      };
      transactions: {
        Row: {
          id: string;
          portfolio_id: string;
          asset_id: string;
          type: Database["public"]["Enums"]["transaction_type"];
          quantity: number;
          price: number;
          executed_at: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          portfolio_id: string;
          asset_id: string;
          type: Database["public"]["Enums"]["transaction_type"];
          quantity: number;
          price: number;
          executed_at?: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          portfolio_id?: string;
          asset_id?: string;
          type?: Database["public"]["Enums"]["transaction_type"];
          quantity?: number;
          price?: number;
          executed_at?: string;
          created_at?: string;
        };
        Relationships: [
          {
            foreignKeyName: "transactions_portfolio_id_fkey";
            columns: ["portfolio_id"];
            isOneToOne: false;
            referencedRelation: "portfolios";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "transactions_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
      price_history: {
        Row: {
          asset_id: string;
          date: string;
          price: number;
        };
        Insert: {
          asset_id: string;
          date: string;
          price: number;
        };
        Update: {
          asset_id?: string;
          date?: string;
          price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "price_history_asset_id_fkey";
            columns: ["asset_id"];
            isOneToOne: false;
            referencedRelation: "assets";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: { [_ in never]: never };
    Functions: { [_ in never]: never };
    Enums: {
      asset_type: "stock" | "etf" | "crypto" | "bond";
      transaction_type: "buy" | "sell";
    };
    CompositeTypes: { [_ in never]: never };
  };
};

type PublicSchema = Database["public"];

export type Tables<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Row"];
export type TablesInsert<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Insert"];
export type TablesUpdate<T extends keyof PublicSchema["Tables"]> =
  PublicSchema["Tables"][T]["Update"];
export type Enums<T extends keyof PublicSchema["Enums"]> =
  PublicSchema["Enums"][T];
