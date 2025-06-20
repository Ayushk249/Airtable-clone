// types/database.ts
// These types should match your Prisma schema exactly

export enum ColumnType {
  TEXT = "TEXT",
  NUMBER = "NUMBER"
}

export interface Base {
  id: string;
  createdAt: Date;
  updatedAt: Date;
  title: string;
  userId: string;
  user?: User;
  tables?: Table[];
}

export interface Table {
  id: string;
  name: string;
  baseId: string;
  base?: Base;
  columns?: Column[];
  rows?: Row[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Column {
  id: string;
  name: string;
  type: ColumnType;
  position: number;
  tableId: string;
  table?: Table;
  cells?: Cell[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Row {
  id: string;
  position: number;
  tableId: string;
  table?: Table;
  cells?: Cell[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Cell {
  id: string;
  value: string | null;
  rowId: string;
  columnId: string;
  row?: Row;
  column?: Column;
  createdAt: Date;
  updatedAt: Date;
}

export interface User {
  id: string;
  name: string | null;
  email: string | null;
  password: string | null;
  emailVerified: Date | null;
  accounts?: Account[];
  sessions?: Session[];
  base?: Base[];
}

export interface Account {
  id: string;
  userId: string;
  provider: string;
  providerAccountId: string;
  type: string;
  access_token?: string | null;
  expires_at?: number | null;
  token_type?: string | null;
  scope?: string | null;
  id_token?: string | null;
  session_state?: string | null;
}

export interface Session {
  id: string;
  sessionToken: string;
  userId: string;
  expires: Date;
}

// You can also create specific types for your API responses
export interface TableWithColumnsAndRows extends Table {
  columns: Column[];
  rows: (Row & {
    cells: (Cell & {
      column: Column;
    })[];
  })[];
}

export interface RowWithCells extends Row {
  cells: (Cell & {
    column: Column;
  })[];
}