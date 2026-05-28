import { useState } from "react";
import { useListPatients, useCreatePatient, PatientInputGender } from "@workspace/api-client-react";
import { MainLayout } from "@/components/layout/main-layout";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Search, Plus, Loader2 } from "lucide-react";
import { Link } from "wouter";
import { useQueryClient } from "@tanstack/react-query";
import { getListPatientsQueryKey } from "@workspace/api-client-react";
import { format } from "date-fns";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

const patientSchema = z.object({
  fullName: z.string().min(1, "Full name is required"),
  age: z.coerce.number().min(0, "Age must be positive").max(120, "Age is too high"),
  gender: z.enum([PatientInputGender.male, PatientInputGender.female, PatientInputGender.other]),
  mobileNumber: z.string().min(1, "Mobile number is required"),
  email: z.string().email("Invalid email").optional().or(z.literal("")),
  address: z.string().optional(),
});

type PatientFormValues = z.infer<typeof patientSchema>;

export default function Patients() {
  const [search, setSearch] = useState("");
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const queryClient = useQueryClient();

  const { data: patientData, isLoading } = useListPatients({ search });
  const createPatient = useCreatePatient();

  const form = useForm<PatientFormValues>({
    resolver: zodResolver(patientSchema),
    defaultValues: {
      fullName: "",
      age: undefined,
      gender: PatientInputGender.other,
      mobileNumber: "",
      email: "",
      address: "",
    },
  });

  const onSubmit = (data: PatientFormValues) => {
    createPatient.mutate({ data }, {
      onSuccess: () => {
        setIsDialogOpen(false);
        form.reset();
        queryClient.invalidateQueries({ queryKey: getListPatientsQueryKey() });
      }
    });
  };

  return (
    <MainLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Patients</h1>
            <p className="text-muted-foreground mt-1">
              Manage your patient directory and create new records.
            </p>
          </div>
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Patient
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-[425px]">
              <DialogHeader>
                <DialogTitle>Add New Patient</DialogTitle>
                <DialogDescription>
                  Enter the patient's details below to create a new record.
                </DialogDescription>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 pt-4">
                  <FormField
                    control={form.control}
                    name="fullName"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Full Name *</FormLabel>
                        <FormControl>
                          <Input placeholder="John Doe" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      control={form.control}
                      name="age"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Age *</FormLabel>
                          <FormControl>
                            <Input type="number" placeholder="25" {...field} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="gender"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Gender *</FormLabel>
                          <Select onValueChange={field.onChange} defaultValue={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Select gender" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              <SelectItem value="male">Male</SelectItem>
                              <SelectItem value="female">Female</SelectItem>
                              <SelectItem value="other">Other</SelectItem>
                            </SelectContent>
                          </Select>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="mobileNumber"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Mobile Number *</FormLabel>
                        <FormControl>
                          <Input placeholder="+1 234 567 8900" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Email (Optional)</FormLabel>
                        <FormControl>
                          <Input type="email" placeholder="john@example.com" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createPatient.isPending}>
                    {createPatient.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Create Patient
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>

        <Card>
          <CardContent className="p-0">
            <div className="p-4 border-b flex items-center">
              <div className="relative w-full max-w-sm">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  type="search"
                  placeholder="Search patients by name or ID..."
                  className="pl-8"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </div>
            </div>
            
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient ID</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Age / Gender</TableHead>
                  <TableHead>Contact</TableHead>
                  <TableHead>Added</TableHead>
                  <TableHead className="text-right">Action</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center">
                      <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
                    </TableCell>
                  </TableRow>
                ) : !patientData?.patients.length ? (
                  <TableRow>
                    <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                      No patients found.
                    </TableCell>
                  </TableRow>
                ) : (
                  patientData.patients.map((patient) => (
                    <TableRow key={patient.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {patient.patientCode}
                      </TableCell>
                      <TableCell className="font-medium">{patient.fullName}</TableCell>
                      <TableCell>
                        {patient.age} / <span className="capitalize">{patient.gender}</span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col text-sm">
                          <span>{patient.mobileNumber}</span>
                          {patient.email && (
                            <span className="text-muted-foreground text-xs">{patient.email}</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {format(new Date(patient.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell className="text-right">
                        <Link href={`/patients/${patient.id}`}>
                          <Button variant="ghost" size="sm">View</Button>
                        </Link>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </MainLayout>
  );
}
