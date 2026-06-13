declare global {
	namespace App {
		interface Error {
			message: string;
			code?: string;
		}
		interface Locals {
			session:
				| { type: 'student'; studentId: string; studentName: string; classId: string }
				| { type: 'teacher'; teacherId: string; teacherEmail: string; isAdmin: boolean }
				| null;
		}
		interface PageData {}
		interface PageState {}
		interface Platform {}
	}
}

export {};
